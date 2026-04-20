# BE-Project & Cloud-Backend Integration Checklist

## ✅ COMPLETED INTEGRATION TASKS

### JWT Configuration
- [x] BE-Project JWT_SECRET updated to: `qwertyuiop1234567890`
- [x] Cloud-Backend EC2 JWT_SECRET is: `qwertyuiop1234567890`
- [x] Both JWT_EXPIRY set to: `24h`
- [x] Legacy ACCESS_TOKEN updated in BE-Project
- [x] Token field normalization implemented (userId, userID, user_id, etc.)

### CORS Configuration
- [x] BE-Project allows: `http://localhost:3000,http://localhost:8000`
- [x] QueryMind Frontend configured to call: `http://localhost:8080`
- [x] Local development CORS is open
- [ ] **TODO**: Update EC2 cloud-backend CORS for production domain

### Frontend Integration
- [x] Auth system updated with token management
- [x] LoginController returns token + user info
- [x] WorkspaceContext integrates with backend API
- [x] Protected routes check authentication
- [x] All API calls include JWT token headers

### Database Integration
- [x] BE-Project uses PostgreSQL (local_db_setup)
- [x] Cloud-Backend uses PostgreSQL (nl2sql_backend on EC2)
- [x] User tokens valid across both databases

---

## 🧪 VERIFICATION TESTS - DO THESE NOW

### Test 1: Start BE-Project Backend
```bash
cd d:\BE-Project
npm start
# Expected: 🚀 Application running on port 8080
```
**Checklist**:
- [ ] Server starts without errors
- [ ] Database connection successful
- [ ] Routes registered
- [ ] Health check works: `curl http://localhost:8080`

### Test 2: Start QueryMind Frontend
```bash
cd d:\QueryMind_Frontend
npm run dev
# Expected: Local: http://localhost:8000
```
**Checklist**:
- [ ] Vite server starts
- [ ] No console errors
- [ ] Can access http://localhost:8000
- [ ] No CORS errors in browser console

### Test 3: User Registration Flow
1. Open http://localhost:8000 in browser
2. Click "Sign Up" tab
3. Fill in:
   - Name: `TestUser`
   - Email: `test@example.com`
   - Password: `password123`
4. Click "Sign Up" button

**Checklist**:
- [ ] Registration succeeds
- [ ] Token stored in localStorage: `localStorage.getItem('authToken')`
- [ ] User data stored: `localStorage.getItem('currentUser')`
- [ ] Redirects to `/workspace` page
- [ ] No **"Invalid token"** errors

### Test 4: User Login Flow
1. Clear localStorage: `localStorage.clear()`
2. Go to http://localhost:8000
3. Click "Sign In" tab
4. Enter:
   - Email: `test@example.com`
   - Password: `password123`
5. Click "Sign In" button

**Checklist**:
- [ ] Login succeeds
- [ ] Token stored in localStorage
- [ ] User redirected to `/workspace`
- [ ] Workspace data loads from backend

### Test 5: Workspace Operations
On the Workspace page:

**Checklist**:
- [ ] Workspaces load from backend (GET /workspace/getWorkspaces)
- [ ] Can see workspace list
- [ ] Can create new workspace
- [ ] Can see query history from localStorage

### Test 6: Protected Routes
1. Try to access `/workspace` without logging in
2. Go to http://localhost:8000/workspace directly

**Checklist**:
- [ ] Redirects to `/auth` (protected route works)
- [ ] Cannot bypass authentication

### Test 7: Token Validation (Developer Test)
In browser console:
```javascript
// Get token
const token = localStorage.getItem('authToken');
console.log('Token:', token);

// Check if token is valid JWT
const parts = token.split('.');
console.log('Valid JWT format:', parts.length === 3);

// Verify it works with API
fetch('http://localhost:8080/workspace/getWorkspaces', {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(data => console.log('API Response:', data))
.catch(e => console.error('API Error:', e));
```

**Checklist**:
- [ ] Token is valid JWT (3 parts separated by dots)
- [ ] Token can access protected endpoints
- [ ] No 401 Unauthorized errors

---

## 🚀 NEXT STEPS AFTER LOCAL TESTING

### If All Local Tests Pass ✅
1. **Commit changes to git**:
   ```bash
   cd d:\BE-Project
   git add -A
   git commit -m "Fix JWT integration: sync secrets with cloud-backend EC2"
   git push origin master
   
   cd d:\QueryMind_Frontend
   git add -A
   git commit -m "Integrate frontend with BE-Project backend API"
   git push origin master
   ```

2. **Test with Cloud-Backend** (requires EC2 access):
   ```bash
   # On EC2:
   ssh ubuntu@98.81.187.77
   
   # Verify cloud-backend JWT_SECRET
   grep JWT_SECRET .env
   
   # Should output:
   # JWT_SECRET=qwertyuiop1234567890
   
   # Verify PM2 is running
   pm2 status
   ```

3. **Update Cloud-Backend CORS** (for production):
   ```bash
   # On EC2:
   ssh ubuntu@98.81.187.77
   
   # Edit .env:
   CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
   
   # Restart PM2:
   pm2 restart all
   ```

4. **Test Cloud-Backend Connection**:
   ```bash
   # From local machine:
   curl http://98.81.187.77:3000/health
   # Should return: {"status":"healthy","service":"cloud-backend",...}
   ```

---

## 📊 INTEGRATION STATUS SUMMARY

| Component | Status | Notes |
|-----------|--------|-------|
| **JWT Secrets** | ✅ SYNCED | `qwertyuiop1234567890` |
| **CORS Config** | ✅ DONE (Local) | Update EC2 CORS later |
| **BE-Project** | ✅ READY | Port 8080 |
| **Cloud-Backend** | ✅ RUNNING | Port 3000 on EC2 |
| **QueryMind-Frontend** | ✅ READY | Port 8000 |
| **Local Testing** | ⏳ IN PROGRESS | Run Test 1-7 above |
| **EC2 Integration** | ⏳ PENDING | After local tests pass |

---

## 🔴 CRITICAL ITEMS - DO NOT SKIP

1. **Verify JWT_SECRET matches** before testing:
   ```bash
   # Local BE-Project
   grep JWT_SECRET d:\BE-Project\.env
   
   # EC2 Cloud-Backend (via SSH)
   grep JWT_SECRET .env
   
   # Both should show: JWT_SECRET=qwertyuiop1234567890
   ```

2. **Clear browser localStorage** before each test:
   ```javascript
   localStorage.clear()
   ```

3. **Check browser console** for errors:
   - Press F12
   - Go to Console tab
   - Look for red error messages

4. **Verify CORS headers** in network tab:
   - Press F12
   - Go to Network tab
   - Click on request
   - Look for: `Access-Control-Allow-Origin: http://localhost:8000`

---

## 💾 FILES THAT WERE MODIFIED

```
d:\BE-Project\
├── .env (JWT_SECRET updated)
├── .env.example (documentation added)
├── JWT_INTEGRATION_GUIDE.md (new file)
└── controllers\userControllers\loginController.js (returns user info with token)

d:\QueryMind_Frontend\
├── .env (created)
├── .env.example (created)
├── src\lib\auth.js (token management + API helpers)
├── src\context\WorkspaceContext.jsx (backend API integration)
├── INTEGRATION_SETUP.md (detailed setup guide)
└── QUICK_START.md (quick reference)

d:\cloud-backend\
└── .env.example (documentation updated)
```

---

## 📞 SUPPORT

If tests fail:

1. **Check BE-Project logs**:
   ```bash
   npm start  # Watch for errors
   ```

2. **Check browser console** (F12):
   - Are there CORS errors?
   - Are there JWT errors?
   - Is the API being called?

3. **Test API directly**:
   ```bash
   # Test health
   curl http://localhost:8080
   
   # Test registration
   curl -X POST http://localhost:8080/user/register \
     -H "Content-Type: application/json" \
     -d '{"username":"test","useremail":"test@test.com","userpassword":"123"}'
   ```

4. **Enable debug logging**:
   In BE-Project `.env`:
   ```
   LOG_LEVEL=debug
   ```

---

**Date**: 2026-04-19  
**Status**: Ready for local testing  
**Next Review**: After Test 1-7 completion
