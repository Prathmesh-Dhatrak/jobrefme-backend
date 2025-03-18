import { IUser } from '../models/userModel';

declare global {
  namespace Express {
    /**
     * This allows us to add custom properties to the `user` object
     * used by Passport.js when authenticating with Google OAuth.
     */
    interface User extends IUser {}
  }
}