# DIP

DIP is a directory for bathhouses, contrast bathing, and other wellness facilities.

## Current state

- Static homepage in `index.html` plus crawlable city landing pages
- Includes city tabs, map integration (Leaflet), filters, and venue cards
- Phase 1 SEO pages added: `/cities/`, `/new-york-city/`, `/los-angeles/`, `/miami/`, `/san-francisco/`, `/chicago/`
- NYC venue pages added (Phase 1b): `/new-york-city/bathhouse-williamsburg/`, `/new-york-city/akari-sauna/`, `/new-york-city/aire-ancient-baths/`, `/new-york-city/russian-and-turkish-baths/`, `/new-york-city/world-spa/`, `/new-york-city/othership-flatiron/`
- Venue data is embedded in the page script

## Run locally

Open `index.html` in a browser. The map uses external Leaflet assets and needs internet access to render.

## Next build steps

1. Split data into JSON files (per city)
2. Move styles and scripts into separate files
3. Add real email capture backend (currently demo-only)
4. Add CMS/admin workflow for venue updates
