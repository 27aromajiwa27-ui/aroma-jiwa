#!/usr/bin/env python3
"""Aroma Jiwa Hadir - zero dependency PWA server."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from server.app import main

if __name__ == "__main__":
    main()
