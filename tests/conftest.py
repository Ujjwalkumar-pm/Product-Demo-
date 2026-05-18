import os
import sys

# Make scripts/ importable as top-level modules in tests.
SCRIPTS = os.path.join(
    os.path.dirname(__file__), "..",
    "skills", "creating-product-demo-video", "scripts",
)
sys.path.insert(0, os.path.abspath(SCRIPTS))
