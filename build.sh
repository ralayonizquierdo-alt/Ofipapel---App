#!/bin/bash
set -e

# Build the alquileres React app
cd alquileres
npm ci
npm run build
cd ..

# Assemble _site: static root files + built alquileres app
mkdir -p _site/alquileres

# Copy root static files
cp index.html _site/
cp Index.html _site/ 2>/dev/null || true
cp canarias-ink.html _site/ 2>/dev/null || true
cp falcontrol.html _site/ 2>/dev/null || true
cp sw.js _site/ 2>/dev/null || true
cp sw-ink.js _site/ 2>/dev/null || true
cp hero-productos.jpg _site/ 2>/dev/null || true
cp logo-canarias-ink.png _site/ 2>/dev/null || true

# Copy the built alquileres app into _site/alquileres/
cp -r alquileres/dist/. _site/alquileres/
