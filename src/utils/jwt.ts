import jwt from 'jsonwebtoken';
import { Roles } from './constants';
import 'dotenv/config';

 export const isAuthenticated = (req, res, next)=>{
    try {
        const token = req.headers.authorization;
        
        if (!token) {
            console.log('JWT Auth: No token provided');
            return res.status(401).json({
                error: 'No authentication token provided',
            });
        }
        
        console.log('JWT Auth: Verifying token:', token.substring(0, 20) + '...');
        const decodedToken = jwt.verify(token, process.env.JWTPRIVATEKEY);
        console.log('JWT Auth: Token verified successfully for user:', decodedToken.id);
        req.token = decodedToken;
        next();
      } catch (error) {
        console.log('JWT Auth: Token verification failed:', error.message);
        res.status(403).json({
          error: 'Invalid or expired token',
        });
    }
};

export const isAdmin = (req, res, next)=>{
    try {
        const token = req.headers.authorization;
        const decodedToken = jwt.verify(token, process.env.JWTPRIVATEKEY);
        if(decodedToken.role && decodedToken.role === Roles.admin){
            req.token = decodedToken;
            next();
        }else{
            res.status(403).json({
                error: 'Permission denied!',
            });
        }
      } catch {
        res.status(403).json({
          error: 'Invalid request!',
        });
    }
};

export default isAuthenticated;