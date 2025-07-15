from flask import Flask, render_template, request, jsonify, session, redirect
from flask_cors import CORS
import os
import threading
import time
from datetime import datetime, timedelta
import firebase_admin
from firebase_admin import credentials, auth, firestore, storage
import qrcode
from pathlib import Path
import json
from werkzeug.utils import secure_filename
import uuid
import secrets
import base64
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Firebase with error handling
try:
    # Check if running on Render or another cloud provider
    firebase_creds = os.environ.get('FIREBASE_CREDENTIALS')
    if firebase_creds:
        # Using environment variable for credentials
        cred_dict = json.loads(firebase_creds)
        cred = credentials.Certificate(cred_dict)
    else:
        # Using local credentials file
        cred_path = os.environ.get('FIREBASE_CREDENTIALS_PATH', "attendmax-a79f3-firebase-adminsdk-fbsvc-5b7357bc6d.json")
        cred = credentials.Certificate(cred_path)
    
    firebase_admin.initialize_app(cred)
    print("Firebase initialized successfully")
except (ValueError, FileNotFoundError) as e:
    if isinstance(e, ValueError) and "already exists" in str(e):
        # App already initialized
        print("Firebase app already initialized")
    else:
        print(f"Error initializing Firebase: {str(e)}")
        raise

# Initialize Firestore
db = firestore.client()

app = Flask(__name__, 
    static_folder='static',
    static_url_path='/static')

# Generate a secure random key at startup or use environment variable
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))

# Configure CORS with security settings
CORS(app, 
     supports_credentials=True,
     resources={r"/api/*": {"origins": os.environ.get('CORS_ORIGINS', "*").split(','),
                           "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                           "allow_headers": ["Content-Type", "Authorization"]}},
     expose_headers=["Content-Type", "Authorization"])

# Ensure the directories exist
os.makedirs('templates', exist_ok=True)
os.makedirs('static', exist_ok=True)
os.makedirs('static/css', exist_ok=True)
os.makedirs('static/js', exist_ok=True)
os.makedirs('static/qr_codes', exist_ok=True)

# Keep track of active QR codes in memory
active_qr_codes = {}
QR_CODE_EXPIRY_SECONDS = int(os.environ.get('QR_CODE_EXPIRY_SECONDS', 60))  # Default 60 seconds expiry time

def cleanup_expired_qr_codes():
    """Remove expired QR codes and their files"""
    while True:
        try:
            current_time = datetime.now()
            expired_codes = []
            
            print(f"Running cleanup, active QR codes: {list(active_qr_codes.keys())}")
            
            for qr_data, info in list(active_qr_codes.items()):
                if (current_time - info['timestamp']).total_seconds() >= QR_CODE_EXPIRY_SECONDS:
                    expired_codes.append(qr_data)
                    # Remove the QR code file
                    try:
                        qr_file = Path('static') / 'qr_codes' / f'{qr_data}.png'
                        if qr_file.exists():
                            qr_file.unlink()
                    except Exception as e:
                        print(f"Error deleting QR code file: {str(e)}")
            
            # Remove expired codes from active_qr_codes
            for code in expired_codes:
                print(f"Expiring QR code: {code}")
                active_qr_codes.pop(code, None)
            
            time.sleep(5)  # Check every 5 seconds
        except Exception as e:
            print(f"Error in cleanup thread: {str(e)}")
            time.sleep(5)  # Continue even if there's an error

# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_expired_qr_codes, daemon=True)
cleanup_thread.start()

# Session configuration
app.config.update(
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    PERMANENT_SESSION_LIFETIME=timedelta(hours=1)
)

def check_session():
    """Check if the session is valid and not expired"""
    if 'user_id' not in session:
        return False
    if 'last_activity' not in session:
        session['last_activity'] = datetime.now().timestamp()
        return True
    
    # Check if session has expired (1 hour timeout)
    last_activity = datetime.fromtimestamp(session['last_activity'])
    if datetime.now() - last_activity > timedelta(hours=1):
        session.clear()
        return False
    
    # Update last activity
    session['last_activity'] = datetime.now().timestamp()
    return True

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/login')
def login_page():
    if check_session():
        role = session.get('role')
        if role == 'admin':
            return redirect('/admin/dashboard')
        elif role == 'student':
            return redirect('/student/dashboard')
    return render_template('login.html')

@app.route('/get-qr-code')
def get_qr_code():
    if not check_session():
        return jsonify({'error': 'Session expired'}), 401
        
    if not active_qr_codes:
        return jsonify({'error': 'No active QR code'}), 404
    latest_qr = max(active_qr_codes.items(), key=lambda x: x[1]['timestamp'])
    return jsonify({'qr_data': latest_qr[0]})

@app.route('/auth/login', methods=['POST'])
def auth_login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'status': 'error',
                'message': 'No data received'
            }), 400

        username = data.get('username')
        password = data.get('password')
        role = data.get('role')

        if not all([username, password, role]):
            return jsonify({
                'status': 'error',
                'message': 'Missing required fields'
            }), 400

        try:
            user = auth.get_user_by_email(username)
            
            # Get user's custom claims to verify role
            custom_claims = auth.get_user(user.uid).custom_claims or {}
            user_role = custom_claims.get('role', '')
            
            if user_role != role:
                return jsonify({
                    'status': 'error',
                    'message': f'Invalid role. You are not authorized as a {role}'
                }), 403
            
            # Create a session for the user
            session.permanent = True
            session['user_id'] = user.uid
            session['role'] = role
            session['email'] = username
            session['last_activity'] = datetime.now().timestamp()

            # If this is a student, ensure they have a record in Firestore
            if role == 'student':
                # Check if student record exists
                student_ref = db.collection('students').document(user.uid)
                student_doc = student_ref.get()

                if not student_doc.exists:
                    # Get department and year from custom claims or use defaults
                    department = custom_claims.get('department', 'Unknown')
                    year = custom_claims.get('year', '1st Year')
                    
                    # Create student record
                    student_ref.set({
                        'uid': user.uid,
                        'email': username,
                        'name': user.display_name or username.split('@')[0],
                        'department': department,
                        'year': year,
                        'created_at': datetime.now(),
                        'last_login': datetime.now()
                    })
                else:
                    # Update last login time
                    student_ref.update({
                        'last_login': datetime.now()
                    })
            
            return jsonify({
                'status': 'success',
                'message': 'Login successful',
                'role': role
            })
        except auth.UserNotFoundError:
            return jsonify({
                'status': 'error',
                'message': 'Invalid email or password'
            }), 401
        except auth.InvalidIdTokenError:
            return jsonify({
                'status': 'error',
                'message': 'Invalid authentication token'
            }), 401
            
    except Exception as e:
        print(f"Login error: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'An error occurred during login'
        }), 500

@app.route('/admin/dashboard')
def admin_dashboard():
    if not check_session() or session.get('role') != 'admin':
        return redirect('/login')
    return render_template('admin_dashboard.html')

@app.route('/student/dashboard')
def student_dashboard():
    if not check_session() or session.get('role') != 'student':
        return redirect('/login')
    return render_template('student_dashboard.html')

# Admin API endpoints
@app.route('/api/admin/stats')
def admin_stats():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        # Fetch real stats from the database
        users = auth.list_users()
        student_count = sum(1 for user in users.users if auth.get_user(user.uid).custom_claims.get('role') == 'student')
        
        # Get today's attendance count
        today = datetime.now().date()
        attendance_ref = db.collection('attendance').where('date', '>=', today).get()
        today_attendance = len(list(attendance_ref))
        
        # Get active sessions count
        active_sessions = len(active_qr_codes)
        
        return jsonify({
            'totalStudents': student_count,
            'todayAttendance': today_attendance,
            'activeSessions': active_sessions
        })
    except Exception as e:
        print(f"Error fetching admin stats: {str(e)}")
        return jsonify({'error': 'Failed to fetch statistics'}), 500

@app.route('/api/admin/recent-activity')
def admin_recent_activity():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        # Fetch recent activities from Firestore
        activities_ref = db.collection('activities').order_by('timestamp', direction='DESCENDING').limit(10)
        activities = []
        
        for doc in activities_ref.get():
            activity = doc.to_dict()
            activity['id'] = doc.id
            activities.append(activity)
        
        return jsonify({'activities': activities})
    except Exception as e:
        print(f"Error fetching recent activities: {str(e)}")
        return jsonify({'error': 'Failed to fetch recent activities'}), 500

@app.route('/api/admin/generate-qr', methods=['POST'])
def admin_generate_qr():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    department = data.get('department')
    year = data.get('year')
    semester = data.get('semester')
    subject = data.get('subject')
    
    if not all([department, year, semester, subject]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    # Generate QR code
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    qr_data = f"{department}_{year}_{semester}_{subject}_{timestamp}"
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
        'semester': semester,
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
    if not check_session():
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
    if not check_session() or session.get('role') != 'student':
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

@app.route('/api/student/subject-attendance')
def get_subject_attendance():
    if not check_session():
        return jsonify({'error': 'Session expired'}), 401
        
    try:
        # Get the current student's ID
        user_id = session.get('user_id')
        
        # Get student data from Firestore
        student_ref = db.collection('students').where('uid', '==', user_id).limit(1).get()
        if not student_ref:
            return jsonify({'error': 'Student not found'}), 404
            
        student_data = student_ref[0].to_dict()
        student_id = student_data['id']
        
        # Query Firestore for subject-wise attendance
        attendance_ref = db.collection('attendance').where('student_id', '==', student_id).get()
        subjects_ref = db.collection('subjects').where('department_id', '==', student_data['department_id']).get()
        
        # Count attendance per subject
        subject_attendance = {}
        for attendance in attendance_ref:
            attendance_data = attendance.to_dict()
            subject_id = attendance_data['subject_id']
            if subject_id in subject_attendance:
                subject_attendance[subject_id]['attended'] += 1
            else:
                subject_attendance[subject_id] = {'attended': 1}
        
        # Format the data for the chart
        subjects = []
        for subject in subjects_ref:
            subject_data = subject.to_dict()
            subject_id = subject_data['id']
            attendance_count = subject_attendance.get(subject_id, {'attended': 0})['attended']
            
            subjects.append({
                'name': subject_data['name'],
                'attendance': attendance_count
            })

        return jsonify({
            'success': True,
            'subjects': subjects
        })

    except Exception as e:
        print(f"Error fetching subject attendance: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch subject attendance data'
        }), 500

@app.route('/api/student/attendance-history')
def student_attendance_history():
    if not check_session() or session.get('role') != 'student':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        # Get attendance records for the student
        attendance_ref = db.collection('attendance').where(
            'student_id', '==', session['user_id']
        ).order_by('timestamp', direction='DESCENDING').limit(10)
        
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
    print(f"Mark attendance request - Session: {session}")
    if not check_session() or session.get('role') != 'student':
        print(f"Unauthorized - User ID in session: {'user_id' in session}, Role: {session.get('role')}")
        return jsonify({
            'success': False,
            'message': 'Unauthorized access. Please log in again.'
        }), 401
    
    data = request.get_json()
    print(f"Request data: {data}")
    qr_data = data.get('qrData')
    
    if not qr_data:
        print("Missing QR data in request")
        return jsonify({
            'success': False,
            'message': 'Invalid QR code data'
        }), 400
    
    try:
        # Get student data from Firestore
        student_ref = db.collection('students').document(session['user_id'])
        student_doc = student_ref.get()
        
        if not student_doc.exists:
            print(f"Student record not found: {session['user_id']}")
            # Try to create student record from Firebase Auth
            try:
                user = auth.get_user(session['user_id'])
                custom_claims = user.custom_claims or {}
                
                # Create student record
                student_data = {
                    'uid': user.uid,
                    'email': user.email,
                    'name': user.display_name or user.email.split('@')[0],
                    'department': custom_claims.get('department', 'Unknown'),
                    'year': custom_claims.get('year', '1st Year'),
                    'created_at': datetime.now(),
                    'last_login': datetime.now()
                }
                student_ref.set(student_data)
                print(f"Created new student record for: {user.uid}")
                student_doc = student_ref.get()
            except Exception as e:
                print(f"Error creating student record: {str(e)}")
                return jsonify({
                    'success': False,
                    'message': 'Unable to verify student information. Please contact support.'
                }), 500

        student_data = student_doc.to_dict()
        
        # Check if QR code exists and is active
        qr_info = active_qr_codes.get(qr_data)
        print(f"Active QR codes: {list(active_qr_codes.keys())}")
        print(f"QR info for {qr_data}: {qr_info}")
        
        if not qr_info:
            print(f"QR code not found or expired: {qr_data}")
            return jsonify({
                'success': False,
                'message': 'Invalid or expired QR code. Please ask your teacher to generate a new one.'
            }), 400
            
        # Check if QR code has expired
        if datetime.now() > qr_info['expires_at']:
            print(f"QR code expired: {qr_data}")
            return jsonify({
                'success': False,
                'message': 'QR code has expired. Please ask your teacher to generate a new one.'
            }), 400
        
        # Check if student belongs to the correct department and year
        if (student_data.get('department') != qr_info['department'] or 
            student_data.get('year') != qr_info['year']):
            print(f"Department/Year mismatch - Student: {student_data}, QR: {qr_info}")
            return jsonify({
                'success': False,
                'message': 'This QR code is not for your class'
            }), 400
        
        # Check if attendance already marked
        attendance_query = db.collection('attendance').where(
            'student_id', '==', session['user_id']
        ).where('qr_code', '==', qr_data).limit(1)
        
        attendance_docs = attendance_query.get()
        if len(list(attendance_docs)) > 0:
            print(f"Attendance already marked for student: {session['user_id']}")
            return jsonify({
                'success': False,
                'message': 'You have already marked attendance for this class'
            }), 400
        
        # Mark attendance
        attendance_data = {
            'student_id': session['user_id'],
            'student_email': session['email'],
            'student_name': student_data.get('name', ''),
            'qr_code': qr_data,
            'department': qr_info['department'],
            'year': qr_info['year'],
            'semester': qr_info['semester'],
            'subject': qr_info['subject'],
            'timestamp': datetime.now()
        }
        
        # Add attendance record to Firestore
        try:
            attendance_ref = db.collection('attendance').add(attendance_data)
            print(f"Attendance marked successfully. Document ID: {attendance_ref[1].id}")
        
            # Return subject and department info for better feedback
            return jsonify({
                'success': True,
                'message': f'Attendance marked successfully for {qr_info["subject"]}',
                'details': {
                    'subject': qr_info['subject'],
                    'department': qr_info['department'],
                    'year': qr_info['year'],
                    'semester': qr_info['semester'],
                    'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                }
            })
        except Exception as e:
            print(f"Firestore error adding attendance: {str(e)}")
            return jsonify({
                'success': False,
                'message': 'Error saving attendance record. Please try again.'
            }), 500
        
    except Exception as e:
        print(f"Error marking attendance: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'An error occurred while marking attendance. Please try again.'
        }), 500

@app.route('/api/admin/attendance-records')
def admin_attendance_records():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        # Get filters from query parameters
        department = request.args.get('department')
        year = request.args.get('year')
        semester = request.args.get('semester')
        subject = request.args.get('subject')
        date = request.args.get('date')
        
        # Build query - use only one where clause to avoid requiring composite indexes
        query = db.collection('attendance')
        
        # Apply only one filter in the query to avoid composite index requirements
        if subject:
            query = query.where('subject', '==', subject)
        elif department:
            query = query.where('department', '==', department)
        elif year:
            query = query.where('year', '==', year)
        elif semester:
            query = query.where('semester', '==', semester)
            
        # Order by timestamp
        query = query.order_by('timestamp', direction='DESCENDING')
        
        # Get records
        records = []
        for doc in query.stream():
            data = doc.to_dict()
            
            # Apply the remaining filters in memory
            if department and data.get('department') != department:
                continue
            if year and data.get('year') != year:
                continue
            if semester and data.get('semester') != semester:
                continue
            if subject and data.get('subject') != subject:
                continue
                
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
                'semester': data.get('semester', ''), # Handle older records that might not have semester
                'timestamp': data['timestamp'].timestamp() * 1000 if isinstance(data['timestamp'], datetime) else data['timestamp']
            })
        
        return jsonify({'records': records})
        
    except Exception as e:
        print(f"Error fetching attendance records: {str(e)}")
        return jsonify({'error': 'Error fetching attendance records'}), 500

# API endpoints for student management
@app.route('/api/admin/students', methods=['GET'])
def get_students():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        # Get all users with student role
        students = []
        users = auth.list_users().iterate_all()
        
        for user in users:
            custom_claims = user.custom_claims or {}
            if custom_claims.get('role') == 'student':
                # Get additional student data from Firestore if available
                student_data = {}
                student_ref = db.collection('students').document(user.uid)
                student_doc = student_ref.get()
                
                if student_doc.exists:
                    student_data = student_doc.to_dict()
                
                students.append({
                    'id': user.uid,
                    'name': user.display_name or '',
                    'email': user.email or '',
                    'department': student_data.get('department', ''),
                    'year': student_data.get('year', ''),
                    'semester': student_data.get('semester', '')
                })
        
        return jsonify({'students': students})
    except Exception as e:
        print(f"Error fetching students: {str(e)}")
        return jsonify({'error': 'Error fetching students'}), 500

@app.route('/api/admin/students', methods=['POST'])
def add_student():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    department = data.get('department')
    year = data.get('year')
    semester = data.get('semester')
    
    if not all([name, email, password, department, year, semester]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    try:
        # Create user in Firebase Auth
        user = auth.create_user(
            email=email,
            password=password,
            display_name=name,
            email_verified=False
        )
        
        # Set custom claims for role
        auth.set_custom_user_claims(user.uid, {'role': 'student'})
        
        # Store additional data in Firestore
        db.collection('students').document(user.uid).set({
            'department': department,
            'year': year,
            'semester': semester,
            'created_at': datetime.now()
        })
        
        return jsonify({
            'success': True,
            'message': 'Student added successfully',
            'student': {
                'id': user.uid,
                'name': name,
                'email': email,
                'department': department,
                'year': year,
                'semester': semester
            }
        })
    except Exception as e:
        print(f"Error adding student: {str(e)}")
        return jsonify({'error': f'Error adding student: {str(e)}'}), 500

@app.route('/api/admin/students/<student_id>', methods=['PUT'])
def update_student(student_id):
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    department = data.get('department')
    year = data.get('year')
    semester = data.get('semester')
    
    if not all([name, email, department, year, semester]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    try:
        # Update user in Firebase Auth
        update_args = {
            'display_name': name,
            'email': email,
        }
        
        if password:
            update_args['password'] = password
            
        auth.update_user(student_id, **update_args)
        
        # Update additional data in Firestore
        db.collection('students').document(student_id).set({
            'department': department,
            'year': year,
            'semester': semester,
            'updated_at': datetime.now()
        }, merge=True)
        
        return jsonify({
            'success': True,
            'message': 'Student updated successfully'
        })
    except Exception as e:
        print(f"Error updating student: {str(e)}")
        return jsonify({'error': f'Error updating student: {str(e)}'}), 500

@app.route('/api/admin/students/<student_id>', methods=['DELETE'])
def delete_student(student_id):
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        # Delete user from Firebase Auth
        auth.delete_user(student_id)
        
        # Delete additional data from Firestore
        db.collection('students').document(student_id).delete()
        
        # Delete attendance records for this student
        attendance_refs = db.collection('attendance').where('student_id', '==', student_id).stream()
        for doc in attendance_refs:
            doc.reference.delete()
        
        return jsonify({
            'success': True,
            'message': 'Student deleted successfully'
        })
    except Exception as e:
        print(f"Error deleting student: {str(e)}")
        return jsonify({'error': f'Error deleting student: {str(e)}'}), 500

# API endpoints for attendance editing
@app.route('/api/admin/attendance', methods=['GET'])
def get_attendance():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    subject = request.args.get('subject')
    department = request.args.get('department')
    year = request.args.get('year')
    semester = request.args.get('semester')
    date = request.args.get('date')
    
    if not subject or not date:
        return jsonify({'error': 'Subject and date are required'}), 400
    
    try:
        # Convert date string to datetime objects for comparison
        date_obj = datetime.strptime(date, '%Y-%m-%d')
        next_day = date_obj + timedelta(days=1)
        
        # Build query to get attendance records for the specified date and subject
        # Use only subject filter to avoid requiring composite indexes
        query = db.collection('attendance').where('subject', '==', subject)
        
        # Get all records for the subject
        records = []
        for doc in query.stream():
            data = doc.to_dict()
            
            # Apply remaining filters in memory
            if department and data.get('department') != department:
                continue
            if year and data.get('year') != year:
                continue
            if semester and data.get('semester') != semester:
                continue
            
            record_date = data['timestamp']
            
            # Check if the record is from the specified date
            if date_obj <= record_date < next_day:
                records.append({
                    'id': doc.id,
                    'student_id': data['student_id'],
                    'student_email': data['student_email'],
                    'timestamp': data['timestamp'].timestamp() * 1000
                })
        
        # Get all students that should be in this class
        students_query = db.collection('students')
        
        # Apply only one filter to avoid composite index requirements
        if department:
            students_query = students_query.where('department', '==', department)
        
        students = []
        for doc in students_query.stream():
            student_id = doc.id
            student_data = doc.to_dict()
            
            # Apply remaining filters in memory
            if year and student_data.get('year') != year:
                continue
            if semester and student_data.get('semester') != semester:
                continue
            
            # Get user data from Firebase Auth
            try:
                user = auth.get_user(student_id)
                
                # Check if student has attendance for this class
                is_present = any(record['student_id'] == student_id for record in records)
                
                students.append({
                    'id': student_id,
                    'name': user.display_name or '',
                    'email': user.email or '',
                    'department': student_data.get('department', ''),
                    'year': student_data.get('year', ''),
                    'semester': student_data.get('semester', ''),
                    'status': 'present' if is_present else 'absent'
                })
            except:
                # Skip if user not found
                pass
        
        return jsonify({
            'subject': subject,
            'department': department,
            'year': year,
            'semester': semester,
            'date': date,
            'students': students
        })
    except Exception as e:
        print(f"Error fetching attendance: {str(e)}")
        return jsonify({'error': f'Error fetching attendance: {str(e)}'}), 500

@app.route('/api/admin/attendance', methods=['POST'])
def update_attendance():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    subject = data.get('subject')
    department = data.get('department')
    year = data.get('year')
    semester = data.get('semester')
    date = data.get('date')
    students = data.get('students', [])
    
    if not subject or not date or not students:
        return jsonify({'error': 'Missing required fields'}), 400
    
    try:
        # Convert date string to datetime
        date_obj = datetime.strptime(date, '%Y-%m-%d')
        date_obj = date_obj.replace(hour=datetime.now().hour, minute=datetime.now().minute, second=datetime.now().second)
        
        # Process each student's attendance
        updated_count = 0
        for student in students:
            student_id = student.get('id')
            status = student.get('status')
            
            if not student_id or not status:
                continue
                
            # Convert date string to datetime objects for comparison
            next_day = date_obj + timedelta(days=1)
            
            # Check if attendance record already exists for this student and subject
            # Use only subject filter to avoid requiring composite indexes
            query = db.collection('attendance').where('student_id', '==', student_id) \
                                            .where('subject', '==', subject)
            
            existing_records = []
            for doc in query.stream():
                data = doc.to_dict()
                
                # Apply remaining filters in memory
                if department and data.get('department') != department:
                    continue
                if year and data.get('year') != year:
                    continue
                if semester and data.get('semester') != semester:
                    continue
                
                record_date = data['timestamp']
                
                # Check if the record is from the specified date
                if date_obj <= record_date < next_day:
                    existing_records.append(doc.reference)
            
            # If status is present and no record exists, create one
            if status == 'present' and not existing_records:
                # Get student email
                try:
                    user = auth.get_user(student_id)
                    student_email = user.email
                    
                    # Create attendance record
                    db.collection('attendance').add({
                        'student_id': student_id,
                        'student_email': student_email,
                        'subject': subject,
                        'department': department or '',
                        'year': year or '',
                        'semester': semester or '',
                        'timestamp': date_obj,
                        'modified_by': session.get('user_id'),
                        'modified_at': datetime.now()
                    })
                    
                    updated_count += 1
                except:
                    # Skip if user not found
                    pass
            
            # If status is absent and records exist, delete them
            elif status == 'absent' and existing_records:
                for record_ref in existing_records:
                    record_ref.delete()
                    updated_count += 1
        
        return jsonify({
            'success': True,
            'message': f'Attendance updated successfully for {updated_count} students'
        })
    except Exception as e:
        print(f"Error updating attendance: {str(e)}")
        return jsonify({'error': f'Error updating attendance: {str(e)}'}), 500

# ERP Module Routes

# Faculty Management
@app.route('/api/faculty', methods=['GET'])
def get_faculty():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        faculty_ref = db.collection('faculty')
        faculty = [doc.to_dict() for doc in faculty_ref.stream()]
        return jsonify({'faculty': faculty})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/faculty', methods=['POST'])
def add_faculty():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        required_fields = ['name', 'email', 'department', 'designation', 'subjects']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        faculty_ref = db.collection('faculty')
        faculty_ref.add({
            'name': data['name'],
            'email': data['email'],
            'department': data['department'],
            'designation': data['designation'],
            'subjects': data['subjects'],
            'status': 'active',
            'created_at': datetime.now()
        })
        return jsonify({'message': 'Faculty added successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Course Management
@app.route('/api/courses', methods=['GET'])
def get_courses():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        courses_ref = db.collection('courses')
        courses = [doc.to_dict() for doc in courses_ref.stream()]
        return jsonify({'courses': courses})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/courses', methods=['POST'])
def add_course():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        required_fields = ['code', 'name', 'department', 'credits', 'semester', 'faculty']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        courses_ref = db.collection('courses')
        courses_ref.add({
            'code': data['code'],
            'name': data['name'],
            'department': data['department'],
            'credits': data['credits'],
            'semester': data['semester'],
            'faculty': data['faculty'],
            'created_at': datetime.now()
        })
        return jsonify({'message': 'Course added successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Timetable Management
@app.route('/api/timetable', methods=['GET'])
def get_timetable():
    if not check_session():
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        department = request.args.get('department')
        year = request.args.get('year')
        semester = request.args.get('semester')
        
        timetable_ref = db.collection('timetable')
        query = timetable_ref
        
        if department:
            query = query.where('department', '==', department)
        if year:
            query = query.where('year', '==', year)
        if semester:
            query = query.where('semester', '==', semester)
            
        timetable = [doc.to_dict() for doc in query.stream()]
        return jsonify({'timetable': timetable})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/timetable', methods=['POST'])
def update_timetable():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        required_fields = ['department', 'year', 'semester', 'slots']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        timetable_ref = db.collection('timetable')
        
        # First, delete existing entries for this department/year/semester
        existing_docs = timetable_ref.where('department', '==', data['department'])\
                                   .where('year', '==', data['year'])\
                                   .where('semester', '==', data['semester'])\
                                   .stream()
        for doc in existing_docs:
            doc.reference.delete()
        
        # Add new timetable entries
        for slot in data['slots']:
            if not all(key in slot for key in ['day', 'time', 'subject', 'faculty', 'room']):
                return jsonify({'error': 'Invalid slot data'}), 400
                
            timetable_ref.add({
                'department': data['department'],
                'year': data['year'],
                'semester': data['semester'],
                'day': slot['day'],
                'time': slot['time'],
                'subject': slot['subject'],
                'faculty': slot['faculty'],
                'room': slot['room'],
                'created_at': datetime.now()
            })
        
        return jsonify({'message': 'Timetable updated successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Examination Management
@app.route('/api/exams', methods=['GET'])
def get_exams():
    if not check_session():
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        exams_ref = db.collection('exams')
        exams = [doc.to_dict() for doc in exams_ref.stream()]
        return jsonify({'exams': exams})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/exams', methods=['POST'])
def schedule_exam():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        required_fields = ['name', 'type', 'department', 'date', 'time', 'duration', 'subjects']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        exams_ref = db.collection('exams')
        exams_ref.add({
            'name': data['name'],
            'type': data['type'],
            'department': data['department'],
            'date': data['date'],
            'time': data['time'],
            'duration': data['duration'],
            'subjects': data['subjects'],
            'status': 'upcoming',
            'created_at': datetime.now()
        })
        return jsonify({'message': 'Exam scheduled successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Results Management
@app.route('/api/results', methods=['GET'])
def get_results():
    if not check_session():
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        results_ref = db.collection('results')
        results = [doc.to_dict() for doc in results_ref.stream()]
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/results', methods=['POST'])
def upload_results():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        required_fields = ['exam_name', 'department', 'subject', 'results']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        results_ref = db.collection('results')
        
        # Validate results data
        for result in data['results']:
            if not all(key in result for key in ['student_email', 'marks', 'grade']):
                return jsonify({'error': 'Invalid result data'}), 400
            
            results_ref.add({
                'exam_name': data['exam_name'],
                'department': data['department'],
                'subject': data['subject'],
                'student_email': result['student_email'],
                'marks': result['marks'],
                'grade': result['grade'],
                'status': 'draft',
                'created_at': datetime.now()
            })
        
        return jsonify({'message': 'Results uploaded successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Library Management
@app.route('/api/library/books', methods=['GET'])
def get_books():
    if not check_session():
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        books_ref = db.collection('library_books')
        books = [doc.to_dict() for doc in books_ref.stream()]
        return jsonify({'books': books})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/library/books', methods=['POST'])
def add_book():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        required_fields = ['title', 'author', 'isbn', 'category', 'copies']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        books_ref = db.collection('library_books')
        books_ref.add({
            'title': data['title'],
            'author': data['author'],
            'isbn': data['isbn'],
            'category': data['category'],
            'copies': data['copies'],
            'available': data['copies'],
            'status': 'available',
            'created_at': datetime.now()
        })
        return jsonify({'message': 'Book added successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Fees Management
@app.route('/api/fees', methods=['GET'])
def get_fees():
    if not check_session():
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        fees_ref = db.collection('fees')
        fees = [doc.to_dict() for doc in fees_ref.stream()]
        return jsonify({'fees': fees})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/fees/challan', methods=['POST'])
def generate_challan():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        required_fields = ['student_email', 'department', 'year', 'semester', 'amount', 'due_date']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        fees_ref = db.collection('fees')
        
        challan_id = str(uuid.uuid4())
        fees_ref.add({
            'challan_id': challan_id,
            'student_email': data['student_email'],
            'department': data['department'],
            'year': data['year'],
            'semester': data['semester'],
            'amount': data['amount'],
            'due_date': data['due_date'],
            'status': 'pending',
            'created_at': datetime.now()
        })
        
        return jsonify({
            'message': 'Challan generated successfully',
            'challan_id': challan_id
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Notifications Management
@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    if not check_session():
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        notifications_ref = db.collection('notifications')
        notifications = [doc.to_dict() for doc in notifications_ref.stream()]
        return jsonify({'notifications': notifications})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/notifications', methods=['POST'])
def create_notification():
    if not check_session() or session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        required_fields = ['title', 'content', 'type', 'target_departments', 'target_years']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        notifications_ref = db.collection('notifications')
        notifications_ref.add({
            'title': data['title'],
            'content': data['content'],
            'type': data['type'],
            'target_departments': data['target_departments'],
            'target_years': data['target_years'],
            'scheduled_for': data.get('scheduled_for'),
            'status': 'active' if not data.get('scheduled_for') else 'scheduled',
            'created_at': datetime.now()
        })
        return jsonify({'message': 'Notification created successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/logout')
def logout():
    try:
        # Clear all session data
        session.clear()
        return redirect('/login')
    except Exception as e:
        print(f"Error during logout: {str(e)}")
        return redirect('/login')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)