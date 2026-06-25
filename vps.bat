@echo off
set PYTHONUTF8=1
set VPS_HOST=34.93.150.116
set VPS_USERNAME=upwork
set VPS_KEY_PATH=C:\Users\pranj\Downloads\key.pem
set VPS_KEY_PASSPHRASE=1234567

python "C:\Users\pranj\OneDrive\Desktop\CLI\scrapeling-UP\vps_login_local.py" %*
