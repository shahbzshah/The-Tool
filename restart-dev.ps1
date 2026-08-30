$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}
Set-Location "c:\Users\Admin\Desktop\code\ideas app"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev > dev.log 2>&1" -WindowStyle Hidden
Start-Sleep -Seconds 15
Get-Content "c:\Users\Admin\Desktop\code\ideas app\dev.log" -Tail 5
