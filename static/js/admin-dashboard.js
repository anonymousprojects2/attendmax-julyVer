document.addEventListener('DOMContentLoaded', function() {
    const qrForm = document.getElementById('qrForm');
    const attendanceTable = document.getElementById('attendanceTable');
    const filterForm = document.getElementById('filterForm');
    let currentQrData = null;
    let qrTimer = null;
    
    // Initialize datepicker if using one
    if (document.getElementById('datePicker')) {
        flatpickr("#datePicker", {
            dateFormat: "Y-m-d"
        });
    }

    // Function to update QR code timer
    function updateQrTimer(qrData) {
        if (!qrData) return;
        
        fetch(`/api/admin/qr-status/${qrData}`)
            .then(response => response.json())
            .then(data => {
                const timerElement = document.getElementById('qrTimer');
                if (!timerElement) return;

                if (!data.active) {
                    // QR code expired, generate new one
                    generateNewQrCode();
                    return;
                }

                timerElement.textContent = `Expires in: ${data.timeRemaining}s`;
                if (data.timeRemaining <= 5) {
                    timerElement.classList.add('expiring');
                } else {
                    timerElement.classList.remove('expiring');
                }
            })
            .catch(error => {
                console.error('Error checking QR status:', error);
            });
    }

    // Function to generate new QR code
    function generateNewQrCode() {
        const department = document.getElementById('department').value;
        const year = document.getElementById('year').value;
        const subject = document.getElementById('subject').value;
        
        fetch('/api/admin/generate-qr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                department: department,
                year: year,
                subject: subject
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            
            currentQrData = data.qrData;
            const qrContainer = document.getElementById('qrContainer');
            qrContainer.innerHTML = `
                <img src="${data.qrCodeUrl}" alt="QR Code" class="qr-code-image">
                <p class="qr-code-info">
                    Department: ${department}<br>
                    Year: ${year}<br>
                    Subject: ${subject}
                </p>
                <p id="qrTimer" class="qr-timer">Expires in: ${data.expiresIn}s</p>
            `;
            qrContainer.classList.remove('hidden');

            // Clear existing timer if any
            if (qrTimer) {
                clearInterval(qrTimer);
            }

            // Start new timer
            qrTimer = setInterval(() => {
                updateQrTimer(currentQrData);
            }, 1000);
        })
        .catch(error => {
            console.error('Error generating QR code:', error);
            alert('Error generating QR code. Please try again.');
        });
    }

    // Generate QR Code
    qrForm.addEventListener('submit', function(e) {
        e.preventDefault();
        generateNewQrCode();
    });

    // Load attendance records with filters
    function loadAttendanceRecords(filters = {}) {
        let url = '/api/admin/attendance-records';
        const queryParams = new URLSearchParams(filters);
        if (queryParams.toString()) {
            url += '?' + queryParams.toString();
        }

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }

                const records = data.records;
                const tbody = attendanceTable.querySelector('tbody');
                tbody.innerHTML = '';

                if (records.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="5" class="text-center">No attendance records found</td>
                        </tr>
                    `;
                    return;
                }

                records.forEach(record => {
                    const date = new Date(record.timestamp);
                    tbody.innerHTML += `
                        <tr>
                            <td>${record.student_email}</td>
                            <td>${record.subject}</td>
                            <td>${record.department}</td>
                            <td>${record.year}</td>
                            <td>${date.toLocaleString()}</td>
                        </tr>
                    `;
                });
            })
            .catch(error => {
                console.error('Error loading attendance records:', error);
                attendanceTable.querySelector('tbody').innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center text-red-600">
                            Error loading attendance records. Please try again.
                        </td>
                    </tr>
                `;
            });
    }

    // Handle filter form submission
    if (filterForm) {
        filterForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const filters = {
                department: document.getElementById('filterDepartment').value,
                year: document.getElementById('filterYear').value,
                subject: document.getElementById('filterSubject').value,
                date: document.getElementById('datePicker')?.value
            };

            // Remove empty filters
            Object.keys(filters).forEach(key => {
                if (!filters[key]) {
                    delete filters[key];
                }
            });

            loadAttendanceRecords(filters);
        });

        // Clear filters button
        document.getElementById('clearFilters')?.addEventListener('click', function() {
            filterForm.reset();
            loadAttendanceRecords();
        });
    }

    // Initial load of attendance records
    loadAttendanceRecords();

    // Clean up timer when leaving page
    window.addEventListener('beforeunload', () => {
        if (qrTimer) {
            clearInterval(qrTimer);
        }
    });
});
