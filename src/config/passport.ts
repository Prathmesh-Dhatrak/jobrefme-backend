import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import User from '../models/User';
import { logger } from '../utils/logger';

/**
 * Configure Passport strategies
 */
export const configurePassport = (): void => {
  // Serialize user into session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      logger.error(`Error deserializing user: ${error}`);
      done(error, null);
    }
  });

  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: '/api/v1/auth/google/callback',
      scope: ['profile', 'email']
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        
        if (user) {
          user.lastLogin = new Date();
          await user.save();
          
          return done(null, user);
        }
        
        const existingUser = await User.findOne({ email: profile.emails?.[0].value });
        
        if (existingUser) {
          existingUser.googleId = profile.id;
          existingUser.lastLogin = new Date();
          
          if (profile.photos && profile.photos.length > 0) {
            existingUser.profilePicture = profile.photos[0].value;
          }
          
          await existingUser.save();
          
          return done(null, existingUser);
        }
        
        const newUser = await User.create({
          googleId: profile.id,
          email: profile.emails?.[0].value,
          displayName: profile.displayName,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          profilePicture: profile.photos?.[0].value,
          lastLogin: new Date()
        });
        
        return done(null, newUser);
      } catch (error) {
        logger.error(`Google strategy error: ${error}`);
        return done(error as Error);
      }
    }
  ));

  passport.use(new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'your_jwt_secret_key'
    },
    async (payload, done) => {
      try {
        const user = await User.findById(payload.id);
        
        if (!user) {
          return done(null, false);
        }
        
        return done(null, user);
      } catch (error) {
        logger.error(`JWT strategy error: ${error}`);
        return done(error, false);
      }
    }
  ));
};