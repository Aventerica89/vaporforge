# Security Guidance Skill

Comprehensive security checks and recommendations.

## Security Checklist

### Authentication & Authorization
- [ ] Passwords hashed with bcrypt/argon2
- [ ] JWT tokens properly validated
- [ ] Session management secure
- [ ] Rate limiting on auth endpoints
- [ ] MFA support where appropriate

### Input Validation
- [ ] All user input validated
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output encoding)
- [ ] CSRF protection enabled
- [ ] File upload restrictions

### Data Protection
- [ ] Sensitive data encrypted at rest
- [ ] TLS for data in transit
- [ ] PII handling compliant
- [ ] Secrets not in code/logs
- [ ] Proper error messages (no leaks)

### API Security
- [ ] Authentication required
- [ ] Authorization checked
- [ ] Input size limits
- [ ] Rate limiting
- [ ] CORS properly configured

### Infrastructure
- [ ] Dependencies updated
- [ ] Security headers set
- [ ] Logging configured
- [ ] Monitoring in place
- [ ] Backup strategy

## Common Vulnerabilities

### OWASP Top 10
1. Injection
2. Broken Authentication
3. Sensitive Data Exposure
4. XML External Entities (XXE)
5. Broken Access Control
6. Security Misconfiguration
7. Cross-Site Scripting (XSS)
8. Insecure Deserialization
9. Using Components with Known Vulnerabilities
10. Insufficient Logging & Monitoring

## Commands

- `/security audit` - Run full security audit
- `/security check <file>` - Check specific file
- `/security deps` - Check dependency vulnerabilities
- `/security headers` - Verify security headers
- `/security secrets` - Scan for exposed secrets
