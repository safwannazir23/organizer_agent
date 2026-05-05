import os
import json
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from organizer_agent import get_reorganization_plan
from google import genai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='frontend')
CORS(app)

@app.route('/api/plan', methods=['POST'])
def generate_plan():
    data = request.json or {}
    template = data.get("template", "Generic")
    files = data.get("files", [])
    
    if not files:
        return jsonify({"error": "No files provided for planning"}), 400
        
    try:
        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        plan = get_reorganization_plan(client, files, template=template)
        
        if plan:
            # Filter out identical paths
            filtered_plan = {}
            for old_path, new_path in plan.items():
                # In browser mode we use forward slashes primarily
                if old_path.replace('\\', '/') != new_path.replace('\\', '/'):
                    filtered_plan[old_path] = new_path
            
            return jsonify({"plan": filtered_plan})
        else:
            return jsonify({"error": "Failed to generate plan"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
