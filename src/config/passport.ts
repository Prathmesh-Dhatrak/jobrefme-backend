import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { logger } from '../utils/logger';
import User, { IUser } from '../models/userModel';

export function configurePassport(): void {
  // Serialize user to store in the session
  passport.serializeUser((user: Express.User, done) => {
    done(null, (user as IUser)._id);
  });

  // Deserialize user from the session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  // Configure Google Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/v1/auth/google/callback',
        scope: ['profile', 'email'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          // Check if user exists in database
          let user = await User.findOne({ googleId: profile.id });

          if (user) {
            // Update last login time for existing user
            user.lastLogin = new Date();
            await user.save();
            logger.info(`User logged in: ${user.email}`);
            return done(null, user);
          }

          // Create new user if not exists
          const email = profile.emails?.[0]?.value || '';
          const firstName = profile.name?.givenName || '';
          const lastName = profile.name?.familyName || '';
          const displayName = profile.displayName || `${firstName} ${lastName}`.trim();
          const profilePhoto = profile.photos?.[0]?.value || '';

          user = new User({
            googleId: profile.id,
            email,
            firstName,
            lastName,
            displayName,
            profilePhoto,
          });

          await user.save();
          logger.info(`New user created: ${user.email}`);
          return done(null, user);
        } catch (error) {
          logger.error(`Error in Google authentication: ${error instanceof Error ? error.message : String(error)}`);
          return done(error as Error, undefined);
        }
      }
    )
  );
}