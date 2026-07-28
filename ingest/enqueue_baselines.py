import logging
import sys
from collections import defaultdict
from typing import Set

from ingest.db import connection

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ingest.enqueue_baselines")

def main():
    
    # Kind to use for baselines in the capture queue
    BASELINE_KIND = "baseline"
    
    # For baselines, they are not org-specific, but the queue is currently org-scoped.
    # So we'll enqueue for the first org or a dummy org?
    # Wait, capture_queue is org-scoped. Let's see if we should enqueue it per org.
    # It makes more sense to enqueue it once and any capture run will process it.
    
    with connection() as conn:
        # Get one org id to own the baseline requests.
        # Alternatively, get all orgs and pick the first one.
        cursor = conn.execute("SELECT id FROM orgs LIMIT 1")
        org = cursor.fetchone()
        
        if not org:
            logger.error("No orgs found in the database. Cannot enqueue baselines.")
            sys.exit(1)
            
        org_id = org["id"]
        
        # Select all areas that have an idealista_url
        cursor = conn.execute("SELECT id, idealista_url FROM areas WHERE idealista_url IS NOT NULL")
        areas = cursor.fetchall()
        
        if not areas:
            logger.warning("No areas with idealista_url found. Nothing to enqueue.")
            return

        urls_to_enqueue = set()
        for area in areas:
            url = f"https://www.idealista.pt/media/relatorios-preco-habitacao/{area['idealista_url']}"
            urls_to_enqueue.add(url)
            
        # Filter out urls that are already pending or processing in the queue
        cursor = conn.execute(
            """
            SELECT url FROM capture_queue 
            WHERE org_id = %s AND kind = %s AND state IN ('pending', 'processing')
            """,
            (org_id, BASELINE_KIND)
        )
        existing_urls = {row["url"] for row in cursor.fetchall()}
        
        new_urls = urls_to_enqueue - existing_urls
        
        if not new_urls:
            logger.info("All baselines are already in the queue.")
            return
            
        logger.info(f"Enqueueing {len(new_urls)} new baseline URLs...")
        
        # Insert them
        from psycopg import sql
        
        import uuid
        
        # Batch insert
        records = [(str(uuid.uuid4()), org_id, url, BASELINE_KIND, "pending") for url in new_urls]
        
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO capture_queue (id, org_id, url, kind, state, updated_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
                ON CONFLICT (org_id, url, kind) DO UPDATE SET state = 'pending', attempts = 0, updated_at = NOW()
                """,
                records
            )
            
        logger.info(f"Successfully enqueued {len(new_urls)} baselines.")

if __name__ == "__main__":
    main()
