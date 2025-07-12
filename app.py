from flask import Flask, render_template, request, jsonify, session, redirect
from flask_cors import CORS
import os
import threading
import time
from datetime import datetime, timedelta
import firebase_admin
from firebase_admin import credentials, auth, firestore
import qrcode
from pathlib import Path

# Initialize Firebase
cred = credentials.Certificate("attendmax-a79f3-firebase-adminsdk-fbsvc-5b7357bc6d.json")
try:
    firebase_admin.initialize_app(cred)
except ValueError:
    # App already initialized
    pass

# Initialize Firestore
db = firestore.client()

app = Flask(__name__)
app.secret_key = os.urandom(12)
CORS(app)

# Ensure the templates directory exists
os.makedirs('templates', exist_ok=True)
os.makedirs('static', exist_ok=True)
os.makedirs('static/css', exist_ok=True)
os.makedirs('static/js', exist_ok=True)
os.makedirs('static/qr_codes', exist_ok=True)

# Keep track of active QR codes in memory
active_qr_codes = {}
QR_CODE_EXPIRY_SECONDS = 15

def cleanup_expired_qr_codes():
    """Remove expired QR codes and their files"""
    while True:
        current_time = datetime.now()
        expired_codes = []
        
        for qr_data, info in active_qr_codes.items():
            if (current_time - info['timestamp']).total_seconds() >= QR_CODE_EXPIRY_SECONDS:
                expired_codes.append(qr_data)
                # Delete the QR code file
                try:
                    img_path = str(Path('static') / 'qr_codes' / f'{qr_data}.png')
                    if os.path.exists(img_path):
                        os.remove(img_path)
                except Exception as e:
                    print(f"Error deleting QR code file: {str(e)}")
        
        # Remove expired codes from active_qr_codes
        for code in expired_codes:
            active_qr_codes.pop(code, None)
        
        time.sleep(1)  # Check every second

# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_expired_qr_codes, daemon=True)
cleanup_thread.start()

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/get-qr-code')
def get_qr_code():
    if not active_qr_codes:
        return jsonify({'error': 'No active QR code'}), 404
    latest_qr = max(active_qr_codes.items(), key=lambda x: x[1]['timestamp'])
    return jsonify({'qr_data': latest_qr[0]})

@app.route('/auth/login', methods=['POST'])
def auth_login():
    try:
        data = request.get_json()
        if not data:
            print("No JSON data received")
            return jsonify({
                'status': 'error',
                'message': 'No data received'
            }), 400

        username = data.get('username')
        password = data.get('password')
        role = data.get('role')

        if not all([username, password, role]):
            print(f"Missing required fields: {data}")
            return jsonify({
                'status': 'error',
                'message': 'Missing required fields'
            }), 400

        print(f"Attempting login for user: {username} with role: {role}")
        
        try:
            user = auth.get_user_by_email(username)
            print(f"User found: {user.uid}")
            
            # Get user's custom claims to verify role
            custom_claims = auth.get_user(user.uid).custom_claims or {}
            user_role = custom_claims.get('role', '')
            
            if user_role != role:
                return jsonify({
                    'status': 'error',
                    'message': f'Invalid role. You are not authorized as a {role}'
                }), 403
            
            # Create a session for the user
            session['user_id'] = user.uid
            session['role'] = role
            session['email'] = username
            
            print(f"Session created for user: {session['user_id']}")
            
            return jsonify({
                'status': 'success',
                'message': 'Login successful',
                'role': role
            })
        except auth.UserNotFoundError as e:
            print(f"User not found error: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': 'Invalid email or password'
            }), 401
            
    except Exception as e:
        print(f"Login error: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'An error occurred during login'
        }), 500

@app.route('/admin/dashboard')
def admin_dashboard():
    if 'user_id' not in session or session.get('role') != 'admin':
        return redirect('/login')
    return render_template('admin_dashboard.html')

@app.route('/student/dashboard')
def student_dashboard():
    if 'user_id' not in session or session.get('role') != 'student':
        return redirect('/login')
    return render_template('student_dashboard.html')

# Admin API endpoints
@app.route('/api/admin/stats')
def admin_stats():
    if 'user_id' not in session or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    # Here you would typically fetch real stats from your database
    return jsonify({
        'totalStudents': len(auth.list_users().users),
        'todayAttendance': 0,  # Replace with actual count
        'activeSessions': 0  # Replace with actual count
    })

@app.route('/api/admin/recent-activity')
def admin_recent_activity():
    if 'user_id' not in session or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    # Here you would typically fetch real activity data from your database
    return jsonify({
        'activities': []  # Replace with actual activities
    })

@app.route('/api/admin/generate-qr', methods=['POST'])
def admin_generate_qr():
    if 'user_id' not in session or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    department = data.get('department')
    year = data.get('year')
    subject = data.get('subject')
    
    if not all([department, year, subject]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    # Generate QR code
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    qr_data = f"{department}_{year}_{subject}_{timestamp}"
    qr.add_data(qr_data)
    qr.make(fit=True)
    
    # Create QR code image
    qr_img = qr.make_image(fill_color="black", back_color="white")
    
    # Save QR code to static directory
    img_path = str(Path('static') / 'qr_codes' / f'{qr_data}.png')
    os.makedirs(os.path.dirname(img_path), exist_ok=True)
    with open(img_path, 'wb') as f:
        qr_img.save(f)
    
    # Store QR data in memory with expiration time
    active_qr_codes[qr_data] = {
        'department': department,
        'year': year,
        'subject': subject,
        'timestamp': datetime.now(),
        'created_by': session.get('user_id'),
        'expires_at': datetime.now() + timedelta(seconds=QR_CODE_EXPIRY_SECONDS)
    }
    
    return jsonify({
        'qrCodeUrl': f'/static/qr_codes/{qr_data}.png',
        'qrData': qr_data,
        'expiresIn': QR_CODE_EXPIRY_SECONDS
    })

@app.route('/api/admin/qr-status/<qr_data>')
def get_qr_status(qr_data):
    if 'user_id' not in session or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
        
    qr_info = active_qr_codes.get(qr_data)
    if not qr_info:
        return jsonify({
            'active': False,
            'message': 'QR code expired'
        })
    
    time_remaining = (qr_info['expires_at'] - datetime.now()).total_seconds()
    return jsonify({
        'active': time_remaining > 0,
        'timeRemaining': max(0, round(time_remaining)),
        'message': 'QR code active' if time_remaining > 0 else 'QR code expired'
    })

# Student API endpoints
@app.route('/api/student/stats')
def student_stats():
    if 'user_id' not in session or session.get('role') != 'student':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        # Get all unique subjects for the student
        attendance_ref = db.collection('attendance').where(
            'student_id', '==', session['user_id']
        )
        
        attendance_by_subject = {}
        for doc in attendance_ref.stream():
            data = doc.to_dict()
            subject = data['subject']
            if subject not in attendance_by_subject:
                attendance_by_subject[subject] = 1
            else:
                attendance_by_subject[subject] += 1
        
        total_classes = len(attendance_by_subject)
        total_attendance = sum(attendance_by_subject.values())
        
        return jsonify({
            'totalClasses': total_classes,
            'classesAttended': total_attendance,
            'subjectWise': attendance_by_subject
        })
        
    except Exception as e:
        print(f"Error fetching stats: {str(e)}")
        return jsonify({'error': 'Error fetching stats'}), 500

@app.route('/api/student/attendance-history')
def student_attendance_history():
    if 'user_id' not in session or session.get('role') != 'student':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        # Get attendance records for the student
        attendance_ref = db.collection('attendance').where(
            'student_id', '==', session['user_id']
        ).order_by('timestamp', direction=firestore.Query.DESCENDING).limit(10)
        
        history = []
        for doc in attendance_ref.stream():
            data = doc.to_dict()
            history.append({
                'subject': data['subject'],
                'department': data['department'],
                'year': data['year'],
                'timestamp': data['timestamp'].timestamp() * 1000 if isinstance(data['timestamp'], datetime) else data['timestamp']
            })
        
        return jsonify({'history': history})
        
    except Exception as e:
        print(f"Error fetching attendance history: {str(e)}")
        return jsonify({'error': 'Error fetching attendance history'}), 500

@app.route('/api/student/mark-attendance', methods=['POST'])
def student_mark_attendance():
    if 'user_id' not in session or session.get('role') != 'student':
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    qr_data = data.get('qrData')
    
    if not qr_data:
        return jsonify({
            'success': False,
            'message': 'Invalid QR code data'
        }), 400
    
    try:
        # Check if QR code exists and is active
        qr_info = active_qr_codes.get(qr_data)
        if not qr_info:
            return jsonify({
                'success': False,
                'message': 'Invalid or expired QR code'
            }), 400
        
        # Check if attendance already marked
        attendance_ref = db.collection('attendance').where(
            'student_id', '==', session['user_id']
        ).where('qr_code', '==', qr_data).limit(1)
        
        if len(list(attendance_ref.stream())) > 0:
            return jsonify({
                'success': False,
                'message': 'Attendance already marked'
            }), 400
        
        # Mark attendance
        attendance_data = {
            'student_id': session['user_id'],
            'student_email': session['email'],
            'qr_code': qr_data,
            'department': qr_info['department'],
            'year': qr_info['year'],
            'subject': qr_info['subject'],
            'timestamp': datetime.now()
        }
        
        db.collection('attendance').add(attendance_data)
        
        return jsonify({
            'success': True,
            'message': 'Attendance marked successfully'
        })
        
    except Exception as e:
        print(f"Error marking attendance: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Error marking attendance'
        }), 500

@app.route('/api/admin/attendance-records')
def admin_attendance_records():
    if 'user_id' not in session or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        # Get filters from query parameters
        department = request.args.get('department')
        year = request.args.get('year')
        subject = request.args.get('subject')
        date = request.args.get('date')
        
        # Build query
        query = db.collection('attendance')
        
        if department:
            query = query.where('department', '==', department)
        if year:
            query = query.where('year', '==', year)
        if subject:
            query = query.where('subject', '==', subject)
            
        # Order by timestamp
        query = query.order_by('timestamp', direction='DESCENDING')
        
        # Get records
        records = []
        for doc in query.stream():
            data = doc.to_dict()
            record_date = data['timestamp']
            if isinstance(record_date, datetime):
                record_date = record_date.strftime('%Y-%m-%d')
            
            if date and record_date != date:
                continue
                
            records.append({
                'id': doc.id,
                'student_email': data['student_email'],
                'subject': data['subject'],
                'department': data['department'],
                'year': data['year'],
                'timestamp': data['timestamp'].timestamp() * 1000 if isinstance(data['timestamp'], datetime) else data['timestamp']
            })
        
        return jsonify({'records': records})
        
    except Exception as e:
        print(f"Error fetching attendance records: {str(e)}")
        return jsonify({'error': 'Error fetching attendance records'}), 500

@app.route('/logout')
def logout():
    session.clear()
    return redirect('/')

if __name__ == '__main__':
    app.run(debug=True)