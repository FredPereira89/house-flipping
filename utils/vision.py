import os
import requests
import tempfile
import logging
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)
import google.generativeai as genai

logger = logging.getLogger("VisionIA")

def estimate_condition_from_image(image_url):
    """
    Downloads an image and uses Gemini 1.5 Flash to estimate the property condition.
    Returns: "Ruína", "Bom Estado", "Remodelado", or "Normal"
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
        
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        # Download image
        response = requests.get(image_url, timeout=10)
        response.raise_for_status()
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as tmp:
            tmp.write(response.content)
            tmp_path = tmp.name
            
        try:
            # Upload to Gemini and prompt
            sample_file = genai.upload_file(path=tmp_path)
            
            prompt = """
            You are a real estate expert in Portugal evaluating the interior condition of a property for a house flipping business.
            Look at this photo and classify the condition of the property strictly into one of these 4 categories:
            
            1. 'Ruína' - Needs total structural reconstruction or is completely destroyed/abandoned.
            2. 'Normal' - Needs general modernization (old kitchen/bathroom, dated floors, but livable).
            3. 'Bom Estado' - Very well maintained, might just need a fresh coat of paint.
            4. 'Remodelado' - Recently renovated with modern finishes.
            
            Reply with ONLY the category name. No other text.
            """
            
            result = model.generate_content([sample_file, prompt])
            text = result.text.strip()
            
            # Clean up the file from Gemini storage
            genai.delete_file(sample_file.name)
            
            # Map the text to one of the expected outputs
            valid_categories = ["Ruína", "Normal", "Bom Estado", "Remodelado"]
            for category in valid_categories:
                if category.lower() in text.lower():
                    return category
            
            return "Normal" # Fallback if model answers something weird
            
        finally:
            os.remove(tmp_path)
            
    except Exception as e:
        logger.error(f"Erro ao analisar imagem com IA: {e}")
        return None
