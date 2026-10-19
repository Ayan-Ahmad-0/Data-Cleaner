"""Pytest configuration and environment fixtures."""

import sys
from pathlib import Path

# Add project root to sys.path so 'formats', 'core', 'app' are discoverable
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))
