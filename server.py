#!/usr/bin/env python3
"""
ARTEMIS PRISM — Local Scientific Application Server
Serves the application locally on http://localhost:8000
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable caching and CORS headers for local modules
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

def main():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print("=" * 65)
        print("🌕 ARTEMIS PRISM — Predictive Risk Intelligence for Site & Mission")
        print("   MoonByte Scientific AI Core Online")
        print(f"   Local Server Running at: http://localhost:{PORT}")
        print("=" * 65)
        print("Press Ctrl+C to stop the server.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server. Safe travels to the Moon!")

if __name__ == '__main__':
    main()
