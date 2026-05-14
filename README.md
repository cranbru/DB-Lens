# DB Lens

DB Lens is a single-page SQLite database viewer that runs in the browser. It opens local `.db`, `.sqlite`, and `.sqlite3` files, shows schema relationships, supports SQL queries, and keeps optional saved databases in browser storage.

## Preview

### Landing Page
![Landing page](https://raw.githubusercontent.com/cranbru/DB-Lens/refs/heads/main/images/Landing_page.png)

### Dashboard
![Dashboard](https://raw.githubusercontent.com/cranbru/DB-Lens/refs/heads/main/images/Dashboard.png)

### Relationship Graph
![Relationship graph](https://raw.githubusercontent.com/cranbru/DB-Lens/refs/heads/main/images/Relationship_graph.png)

## Features

- Upload and inspect SQLite databases locally
- View table counts, row counts, columns, indexes, and foreign keys
- Browse tables with search, sorting, pagination, and row inspection
- Run SQL queries in the browser with `sql.js`
- Visualize table relationships with D3
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

## Usage

Open `app.html` in a browser, upload a SQLite database, or try the built-in sample database.

## Project Structure

```text
Db_viewer/
  app.html
  README.md
  docs/images/
```

## Future Improvements

- Add export options for charts and relationship graphs
- Add saved SQL snippets and query history
- Add schema diffing between two databases
- Add table-level notes and bookmarks
- Add keyboard-accessible command palette
- Add tests for database loading, profile storage, and query results
