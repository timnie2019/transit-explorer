"""Entry point — python run.py"""
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from app.main import app

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5001))
    print(f"transit-explorer running at http://localhost:{port}")
    app.run(debug=False, port=port, host="0.0.0.0")
