# Ninale Estimate

Full stack estimate builder for construction projects using React, PHP and MySQL/MariaDB.

## Local Run

1. Start XAMPP Apache/MariaDB or at least MariaDB.
2. Start the PHP API:

   ```powershell
   C:\xampp\php\php.exe -S 127.0.0.1:8000 -t api
   ```

3. Start React:

   ```powershell
   npm install
   npm run dev
   ```

4. Open `http://127.0.0.1:5173`.

The PHP API creates the `ninale_estimate` database automatically and seeds bridge, road, Kolhapuri bandhara, KT-style and building starter templates.

## Current Scope

- Dummy login screen. Click Login to enter the app.
- Dashboard, projects, templates, rate master, adjustment screen and report screen.
- Bridge template seeded from the provided 30-page sample estimate structure.
- Project save/update in MySQL.
- Live report recalculation when values change.
- Print support through the report screen.
