#!/usr/bin/env bash
# Exit on error
set -o errexit

# Use Python 3.9 specifically
export PYTHON_VERSION=3.9.18

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt 