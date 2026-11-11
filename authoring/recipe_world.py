"""The recipe and its components as aepm's evaluator reads them (aepm.recipe.World.from_directories).

Components are read from OURPOKER_COMPONENTS, or from the folder `components/` two levels above this repository.
"""
import os
from pathlib import Path

from aepm import recipe

ROOT = Path(__file__).resolve().parent.parent
COMPONENTS = Path(os.environ.get("OURPOKER_COMPONENTS") or ROOT.parent.parent / "components")


def world(components=None):
    return recipe.World.from_directories(ROOT, Path(components) if components else COMPONENTS)
