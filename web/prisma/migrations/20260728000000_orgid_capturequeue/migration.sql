-- DropIndex
DROP INDEX "capture_queue_url_kind_key";

-- CreateIndex
CREATE UNIQUE INDEX "capture_queue_org_id_url_kind_key" ON "capture_queue"("org_id", "url", "kind");
