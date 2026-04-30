import requests
import os
from pathlib import Path

def download_from_supabase(public_url, save_path):
    """
    Mendownload file PDF dari Supabase Storage Public URL.
    """
    import urllib.parse
    
    print(f"[Supabase] Mendownload file dari: {public_url}")
    
    # Encode URL untuk menangani spasi (tapi biarkan protokol dan domain tetap)
    parsed = urllib.parse.urlparse(public_url)
    encoded_path = urllib.parse.quote(parsed.path)
    encoded_url = urllib.parse.urlunparse(parsed._replace(path=encoded_path))
    
    # Pastikan direktori tujuan ada
    Path(save_path).parent.mkdir(parents=True, exist_ok=True)

    response = requests.get(encoded_url, stream=True, timeout=30)
    if response.status_code == 200:
        with open(save_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"[Supabase] Selesai! File disimpan di: {save_path}")
        return True
    else:
        raise Exception(f"Gagal download (HTTP {response.status_code}): {response.text}")
