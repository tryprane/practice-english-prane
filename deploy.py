import paramiko
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HOST = '34.93.150.116'
USERNAME = 'upwork'
KEY_PATH = r'C:\Users\pranj\Downloads\key.pem'
PASSPHRASE = '1234567'

def run_ssh(commands):
    key = paramiko.RSAKey.from_private_key_file(KEY_PATH, password=PASSPHRASE)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USERNAME, pkey=key, timeout=20)
    
    for cmd in commands:
        print(f"=== Running: {cmd} ===")
        stdin, stdout, stderr = client.exec_command(cmd)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        if out: print(out.strip())
        if err: print(f"STDERR: {err.strip()}")
    
    client.close()

if __name__ == "__main__":
    run_ssh(sys.argv[1:])
