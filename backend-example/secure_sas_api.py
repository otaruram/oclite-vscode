"""
secure_sas_api.py - Python backend API for generating secure SAS tokens

This is an example of how to implement the secure SAS token generation
on your Python backend. You can adapt this to your existing Azure Functions
or Flask/FastAPI setup.
"""

from datetime import datetime, timedelta, timezone
from azure.storage.blob import generate_blob_sas, BlobSasPermissions
from flask import Flask, jsonify, request
import os
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Configuration - use environment variables in production
STORAGE_ACCOUNT_NAME = os.getenv('AZURE_STORAGE_ACCOUNT_NAME', 'your_storage_account')
STORAGE_ACCOUNT_KEY = os.getenv('AZURE_STORAGE_ACCOUNT_KEY', 'your_account_key')
CONTAINER_NAME = 'oclite-gallery'

def generate_secure_image_url(blob_name: str) -> dict:
    """
    Generate a secure, read-only SAS URL for an image blob with 1-hour expiry.
    
    Args:
        blob_name: Blob name/path (e.g., 'users/123/image.png')
    
    Returns:
        Dict with secure URL and expiry information
    """
    try:
        # Generate read-only SAS token with 1-hour expiry
        now = datetime.now(timezone.utc)
        expiry_time = now + timedelta(hours=1)
        start_time = now - timedelta(minutes=5)  # Handle clock skew
        
        sas_token = generate_blob_sas(
            account_name=STORAGE_ACCOUNT_NAME,
            container_name=CONTAINER_NAME,
            blob_name=blob_name,
            account_key=STORAGE_ACCOUNT_KEY,
            permission=BlobSasPermissions(read=True),  # Read-only permission
            expiry=expiry_time,
            start=start_time
        )
        
        # Construct the full URL
        secure_url = f"https://{STORAGE_ACCOUNT_NAME}.blob.core.windows.net/{CONTAINER_NAME}/{blob_name}?{sas_token}"
        
        return {
            'success': True,
            'secure_url': secure_url,
            'expires_at': expiry_time.isoformat(),
            'expires_in_seconds': 3600
        }
        
    except Exception as e:
        logging.error(f"Error generating SAS URL for {blob_name}: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }

@app.route('/api/secure-image-url', methods=['POST'])
def get_secure_image_url():
    """
    API endpoint to generate secure SAS URL for a single image.
    
    Expected JSON payload:
    {
        "blob_name": "users/123/image.png"
    }
    """
    try:
        data = request.get_json()
        blob_name = data.get('blob_name')
        
        if not blob_name:
            return jsonify({
                'success': False,
                'error': 'blob_name is required'
            }), 400
        
        result = generate_secure_image_url(blob_name)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logging.error(f"API error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@app.route('/api/secure-gallery-urls', methods=['POST'])
def get_secure_gallery_urls():
    """
    API endpoint to generate secure SAS URLs for multiple images.
    
    Expected JSON payload:
    {
        "blob_names": ["users/123/image1.png", "users/123/image2.png"]
    }
    """
    try:
        data = request.get_json()
        blob_names = data.get('blob_names', [])
        
        if not blob_names or not isinstance(blob_names, list):
            return jsonify({
                'success': False,
                'error': 'blob_names array is required'
            }), 400
        
        results = []
        for blob_name in blob_names:
            result = generate_secure_image_url(blob_name)
            results.append({
                'blob_name': blob_name,
                **result
            })
        
        return jsonify({
            'success': True,
            'results': results,
            'total_processed': len(results)
        })
        
    except Exception as e:
        logging.error(f"Batch API error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'service': 'OCLite Secure SAS API'
    })

if __name__ == '__main__':
    # Development server - use proper WSGI server in production
    app.run(debug=True, host='0.0.0.0', port=5000)