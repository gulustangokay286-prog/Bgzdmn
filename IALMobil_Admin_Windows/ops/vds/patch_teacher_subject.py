"""Expose personnel specialization as branch for old and new admin clients."""
from pathlib import Path
import sys
path = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend/veri.js')
source = path.read_text()
source = source.replace('SELECT * FROM api_users WHERE $1 = ANY(roles) ORDER BY full_name LIMIT $2',
                        'SELECT *, COALESCE(branch, subject) AS branch FROM api_users WHERE $1 = ANY(roles) ORDER BY full_name LIMIT $2')
source = source.replace('SELECT * FROM api_users ORDER BY full_name LIMIT $1',
                        'SELECT *, COALESCE(branch, subject) AS branch FROM api_users ORDER BY full_name LIMIT $1')
source = source.replace('SELECT * FROM api_users WHERE kisi_id = $1',
                        'SELECT *, COALESCE(branch, subject) AS branch FROM api_users WHERE kisi_id = $1')
source = source.replace('`SELECT * FROM api_users\n              WHERE school_number',
                        '`SELECT *, COALESCE(branch, subject) AS branch FROM api_users\n              WHERE school_number')
path.write_text(source)
print('Teacher subject compatibility ready')
