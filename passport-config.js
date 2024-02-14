const LocalStrategy = require('passport-local').Strategy;
const { driver } = require('./db');


function initialize(passport) {
  passport.use(new LocalStrategy(async (email, password, done) => {
    try {
      const result = await driver.session().run('MATCH (u:User {email: $email}) RETURN u', {
        email,
      });

      const user = result.records[0] ? result.records[0].get(0).properties : null;

      if (user && password == user.password) {
        return done(null, user);
      } else {
        return done(null, false, { message: 'Invalid email or password' });
      }
    } catch (error) {
      return done(error);
    }
  }));

  passport.serializeUser((user, done) => {
    done(null, user.email);
  });

  passport.deserializeUser(async (email, done) => {
    try {
      const result = await driver.session().run('MATCH (u:User {email: $email}) RETURN u', {
        email,
      });

      const user = result.records[0] ? result.records[0].get(0).properties : null;
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
}

module.exports = initialize;