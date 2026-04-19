#!/usr/bin/env python3
"""
PostgreSQL Data Export Script for Smash Bros Leaderboard
Exports data from the PostgreSQL database to CSV files for analysis
"""

import os
import psycopg2
import csv
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT_DIR = Path(__file__).resolve().parents[2]
LEGACY_APP_HOSTS = {
    "smash-leaderboard-frontend.vercel.app",
    "smash-leaderboard-production.up.railway.app",
}


def load_root_env():
    """Load the repo root .env file for local analytics scripts."""
    env_path = ROOT_DIR / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def get_site_url():
    configured = os.environ.get("NEXT_PUBLIC_SITE_URL") or os.environ.get("SITE_URL")
    if not configured:
        return None

    configured = configured.strip()

    if "://" not in configured:
        configured = f"https://{configured}"

    return configured.rstrip("/")


def normalize_app_url(value):
    if not value:
        return value

    site_url = get_site_url()
    if not value.startswith(("http://", "https://")):
        return value

    parsed = urlparse(value)
    if site_url and parsed.netloc in LEGACY_APP_HOSTS:
        path = parsed.path or "/"
        normalized = urljoin(f"{site_url}/", path.lstrip("/"))
        if parsed.query:
            normalized = f"{normalized}?{parsed.query}"
        if parsed.fragment:
            normalized = f"{normalized}#{parsed.fragment}"
        return normalized

    return value

def export_table(cursor, table_name, output_path):
    """Export a table to CSV"""
    cursor.execute(f"SELECT * FROM {table_name}")
    rows = cursor.fetchall()
    columns = [desc[0] for desc in cursor.description]
    picture_index = columns.index("picture") if "picture" in columns else None

    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(columns)
        for row in rows:
            mutable_row = list(row)
            if table_name == "public.players" and picture_index is not None:
                mutable_row[picture_index] = normalize_app_url(
                    mutable_row[picture_index]
                )
            writer.writerow(mutable_row)

    print(f"Exported {len(rows)} rows from {table_name} to {output_path}")
    return len(rows)

def main():
    load_root_env()

    # Database connection from environment variables
    database_url = os.environ.get("DATABASE_URL")

    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        return False

    # Create data directory if it doesn't exist
    data_dir = Path('data')
    data_dir.mkdir(exist_ok=True)

    # Get current timestamp for filenames
    timestamp = datetime.now().strftime('%Y-%m-%d_%H%M%S')

    try:
        # Connect to database
        print(f"Connecting to database...")
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()

        # Remove old data files
        for old_file in data_dir.glob('*.csv'):
            old_file.unlink()
            print(f"Removed old file: {old_file}")

        # Export tables
        tables = [
            ('public.players', f'public_players_export_{timestamp}.csv'),
            ('public.matches', f'public_matches_export_{timestamp}.csv'),
            ('public.match_participants', f'public_match_participants_export_{timestamp}.csv'),
        ]

        for table_name, filename in tables:
            output_path = data_dir / filename
            export_table(cursor, table_name, output_path)

        cursor.close()
        conn.close()

        print(f"\nData export complete at {timestamp}")
        return True

    except Exception as e:
        print(f"ERROR: Failed to export data: {e}")
        return False

if __name__ == '__main__':
    success = main()
    exit(0 if success else 1)
