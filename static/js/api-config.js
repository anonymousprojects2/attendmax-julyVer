// API Configuration
const API_CONFIG = {
    // Get the API base URL from environment or use a default
    BASE_URL: (typeof process !== 'undefined' && process.env && process.env.BACKEND_URL) 
        ? process.env.BACKEND_URL 
        : window.location.hostname === 'localhost' 
            ? 'http://localhost:5000' 
            : 'https://attendmax-api.onrender.com',
    
    // API endpoints
    ENDPOINTS: {
        LOGIN: '/auth/login',
        STUDENT: {
            STATS: '/api/student/stats',
            ATTENDANCE_HISTORY: '/api/student/attendance-history',
            MARK_ATTENDANCE: '/api/student/mark-attendance',
            SUBJECT_ATTENDANCE: '/api/student/subject-attendance',
            PROFILE: '/api/student/profile'
        },
        ADMIN: {
            STATS: '/api/admin/stats',
            RECENT_ACTIVITY: '/api/admin/recent-activity',
            GENERATE_QR: '/api/admin/generate-qr',
            QR_STATUS: '/api/admin/qr-status',
            ATTENDANCE_RECORDS: '/api/admin/attendance-records',
            STUDENTS: '/api/admin/students'
        }
    },
    
    // Get a full URL for a given endpoint
    getUrl(endpoint) {
        return `${this.BASE_URL}${endpoint}`;
    }
};

// For use in browser
if (typeof window !== 'undefined') {
    window.API_CONFIG = API_CONFIG;
}

// For use in Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API_CONFIG;
} 