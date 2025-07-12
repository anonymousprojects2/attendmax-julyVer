document.addEventListener('DOMContentLoaded', function() {
    const startScannerBtn = document.getElementById('startScanner');
    const scannerPlaceholder = document.getElementById('scanner-placeholder');
    const scanResult = document.getElementById('scanResult');
    const scanMessage = document.getElementById('scanMessage');
    const attendanceList = document.getElementById('attendanceList');

    let html5QrCode = null;

    // Update attendance stats
    function updateStats() {
        fetch('/api/student/stats')
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error('Error:', data.error);
                    return;
                }
                document.getElementById('totalClasses').textContent = data.totalClasses;
                document.getElementById('classesAttended').textContent = data.classesAttended;
                document.getElementById('attendancePercentage').textContent = 
                    data.totalClasses > 0 
                        ? Math.round((data.classesAttended / data.totalClasses) * 100) + '%'
                        : '0%';
            })
            .catch(error => console.error('Error fetching stats:', error));
    }

    // Update attendance history
    function updateAttendanceHistory() {
        fetch('/api/student/attendance-history')
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error('Error:', data.error);
                    return;
                }
                attendanceList.innerHTML = data.history.length > 0 
                    ? data.history.map(record => `
                        <div class="attendance-item">
                            <p><strong>${record.subject}</strong> - ${record.department} ${record.year}</p>
                            <small>${new Date(record.timestamp).toLocaleString()}</small>
                        </div>
                    `).join('')
                    : '<div class="no-attendance">No attendance records found</div>';
            })
            .catch(error => console.error('Error fetching attendance history:', error));
    }

    // Start QR scanner
    async function startScanner() {
        scannerPlaceholder.classList.add('hidden');
        scanResult.classList.add('hidden');
        
        if (html5QrCode && html5QrCode.isScanning) {
            await html5QrCode.stop();
            html5QrCode = null;
        }

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true
        };

        try {
            html5QrCode = new Html5Qrcode("qr-reader");
            
            // Try to get cameras
            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length) {
                // Try environment facing camera first
                try {
                    await html5QrCode.start(
                        { facingMode: "environment" },
                        config,
                        handleScan,
                        handleError
                    );
                } catch (err) {
                    // If environment camera fails, try any available camera
                    console.log("Falling back to any available camera");
                    await html5QrCode.start(
                        devices[0].id,
                        config,
                        handleScan,
                        handleError
                    );
                }
            } else {
                showScanResult('No cameras found on your device.', false);
                scannerPlaceholder.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error starting scanner:', error);
            showScanResult('Error accessing camera. Please make sure you have granted camera permissions.', false);
            scannerPlaceholder.classList.remove('hidden');
        }
    }

    // Handle successful QR scan
    async function handleScan(qrCodeMessage) {
        try {
            // Stop the scanner immediately
            if (html5QrCode && html5QrCode.isScanning) {
                await html5QrCode.stop();
                html5QrCode = null;
            }

            // Show scanning feedback
            showScanResult('Processing QR code...', true);

            // Send scan result to server
            const response = await fetch('/api/student/mark-attendance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ qrData: qrCodeMessage })
            });

            const data = await response.json();
            showScanResult(data.message, data.success);

            if (data.success) {
                // Update stats and history
                updateStats();
                updateAttendanceHistory();
            }

            // Show the start scanner button again
            scannerPlaceholder.classList.remove('hidden');
            
        } catch (error) {
            console.error('Error marking attendance:', error);
            showScanResult('Error marking attendance. Please try again.', false);
            scannerPlaceholder.classList.remove('hidden');
        }
    }

    // Handle QR scanner errors
    function handleError(error) {
        // Only log errors, don't show to user unless it's a critical error
        console.error('QR Scanner error:', error);
    }

    // Show scan result message
    function showScanResult(message, success) {
        scanResult.classList.remove('hidden', 'success', 'error');
        scanResult.classList.add(success ? 'success' : 'error');
        scanMessage.textContent = message;
    }

    // Event listeners
    startScannerBtn.addEventListener('click', startScanner);

    // Initial load
    updateStats();
    updateAttendanceHistory();

    // Update stats and history periodically
    setInterval(updateStats, 30000);
    setInterval(updateAttendanceHistory, 10000);
});
