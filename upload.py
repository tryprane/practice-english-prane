import paramiko
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HOST = '34.93.150.116'
USERNAME = 'upwork'
KEY_PATH = r'C:\Users\pranj\Downloads\key.pem'
PASSPHRASE = '1234567'

def upload_file(local_path, remote_path):
    key = paramiko.RSAKey.from_private_key_file(KEY_PATH, password=PASSPHRASE)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USERNAME, pkey=key, timeout=20)
    
    sftp = client.open_sftp()
    sftp.put(local_path, remote_path)
    sftp.close()
    
    print(f"Uploaded {local_path} to {remote_path}")
    
    # We also need to move the file to /etc/nginx/sites-available using sudo
    print("Moving config to nginx directory...")
    stdin, stdout, stderr = client.exec_command(f"sudo mv {remote_path} /etc/nginx/sites-available/pranjal.prane.one")
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out: print(out.strip())
    if err: print(f"STDERR: {err.strip()}")

    # Enable the site and test nginx
    client.exec_command("sudo ln -sf /etc/nginx/sites-available/pranjal.prane.one /etc/nginx/sites-enabled/")
    client.exec_command("sudo rm -f /etc/nginx/sites-enabled/default")
    
    stdin, stdout, stderr = client.exec_command("sudo nginx -t")
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out: print(out.strip())
    if err: print(f"STDERR: {err.strip()}")
    
    # Restart nginx
    client.exec_command("sudo systemctl restart nginx")
    print("Nginx restarted successfully.")

    client.close()

if __name__ == "__main__":
    upload_file(sys.argv[1], sys.argv[2])
