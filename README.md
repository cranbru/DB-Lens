# DB Lens

DB Lens is a single-page SQLite database viewer that runs in the browser. It opens local `.db`, `.sqlite`, and `.sqlite3` files, shows schema relationships, supports SQL queries, and keeps optional saved databases in browser storage.

## Creator

**Abhinav Gupta**

- GitHub: [cranbru](https://github.com/cranbru)
- LinkedIn: [Abhinav Gupta](https://www.linkedin.com/in/abhinav-gupta-4tech/)

## Preview

### Landing Page
![Landing page](https://raw.githubusercontent.com/cranbru/DB-Lens/refs/heads/main/assests/demo_images/Landing_page.png)

### Dashboard
![Dashboard](https://raw.githubusercontent.com/cranbru/DB-Lens/refs/heads/main/assests/demo_images/Dashboard.png)

### Relationship Graph
![Relationship graph](https://raw.githubusercontent.com/cranbru/DB-Lens/refs/heads/main/assests/demo_images/Relationship_graph.png)

## Features

- Upload and inspect SQLite databases locally
- View table counts, row counts, columns, indexes, and foreign keys
- Browse tables with search, sorting, pagination, and row inspection
- Run SQL queries in the browser with `sql.js`
- Rerun query history and apply saved SQL snippets
- Visualize table relationships with D3
- Export schema graphs as SVG, PNG, or PDF reports
- Compare two SQLite databases and review schema differences
- Navigate foreign-key relationships from table cells and row details
- Pin important tables for faster browsing
- Switch between dark and light themes
- Choose force, compact, or grouped ER diagram layouts
- Build quick charts with Chart.js
- Save recent databases with IndexedDB
- Set a local profile name and avatar

## Tech Stack

- HTML, CSS, and JavaScript
- Tailwind CSS CDN
- sql.js
- D3.js
- Chart.js
- Font Awesome
