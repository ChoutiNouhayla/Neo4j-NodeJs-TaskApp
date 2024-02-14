const express = require('express');
const session = require('express-session');
const flash = require('express-flash');
const passport = require('passport');
const bodyParser = require('body-parser');
const { session: neo4jSession } = require('./db');
const initializePassport = require('./passport-config');
const methodOverride = require('method-override');

const app = express();
app.use(express.static('public'));

const port = 3000;
const crypto = require('crypto');
const secretKey = crypto.randomBytes(64).toString('hex');

initializePassport(passport);


app.set('view engine', 'ejs');
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: secretKey, resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use(methodOverride('_method'));


// Check if the user is authenticated
function checkAuthenticated(req, res, next) {
  const loggedIn = req.session.loggedIn || false;

  if (loggedIn) {
    return next();
  }

  res.redirect('/login');
}

// Home route
app.get('/', checkAuthenticated, async (req, res) => {
  const userEmail = req.session.userEmail;

  const result = await neo4jSession.run('MATCH (u:User {email: $userEmail})-[:HAS_TASK]->(task:Task) RETURN task', { userEmail });

  const tasks = result.records.map(record => record.get('task').properties);

  res.render('tasks.ejs', { user: { email: req.session.userEmail }, tasks });
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Registration route
app.get('/register', (req, res) => {
  res.render('register.ejs');
});

app.post('/register', async (req, res) => {
  const { email, password,nom } = req.body;

  const hashedPassword = password;
  const name = nom;
  const writeTransaction = neo4jSession.beginTransaction();

  try {
    await writeTransaction.run('CREATE (u:User {name: $name,email: $email, password: $password})', {
      name,
      email,
      password: hashedPassword
      
    });

    await writeTransaction.commit();
    console.log('register successful');
    res.redirect('/login');
  } catch (error) {
    await writeTransaction.rollback();
    console.error(error);
    res.redirect('/register');
  } finally {
    
    writeTransaction.close();
  }
});

// Login route
app.get('/login', (req, res) => {
  res.render('login.ejs');
});


app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const readTransaction = neo4jSession.beginTransaction();

  try {
    const result = await readTransaction.run('MATCH (u:User {email: $email}) RETURN u', {
      email,
    });

    const user = result.records[0] ? result.records[0].get(0).properties : null;

    if (user && password == user.password) {
      
      req.session.loggedIn = true;
      req.session.userEmail = email;
      console.log('Login successful');

   
      await readTransaction.commit();
      await readTransaction.close();

      res.redirect('/');
    } else {
      req.flash('error', 'Invalid email or password');
      console.log('error 1');

      
      await readTransaction.close();

      res.redirect('/login');
    }
  } catch (error) {
    
    await readTransaction.rollback();
    console.error(error);

    
    await readTransaction.close();

    res.redirect('/login');
  }
});



// Create task
app.post('/tasks', checkAuthenticated, async (req, res) => {
  const { taskName } = req.body;
  const userEmail = req.session.userEmail;

  const writeTransaction = neo4jSession.beginTransaction();

  try {
    
    const result = await writeTransaction.run(
      'MATCH (u:User {email: $userEmail})-[:HAS_TASK]->(t:Task {name: $taskName}) RETURN t',
      { userEmail, taskName }
    );
    if (result.records.length === 0) {
      
      await writeTransaction.run(
        'MATCH (u:User {email: $userEmail}) ' +
        'CREATE (u)-[:HAS_TASK]->(t:Task {name: $taskName})',
        { userEmail, taskName }
      );

      await writeTransaction.commit();
      console.log('Task created successfully');
    } else {
      console.log('Task with the same name already exists');
    }

  
    await writeTransaction.close();

    res.redirect('/');
  } catch (error) {
    await writeTransaction.rollback();
    console.error(error);
    res.redirect('/');
  }
});

// Update task
app.put('/tasks/:taskName', checkAuthenticated, async (req, res) => {
  const { taskName } = req.params;
  const { updatedTaskName } = req.body;
  const userEmail = req.session.userEmail;
  const writeTransaction = neo4jSession.beginTransaction();

  try {
    await writeTransaction.run(
      'MATCH (u:User {email: $userEmail})-[:HAS_TASK]->(t:Task {name: $taskName}) ' +
      'SET t.name = $updatedTaskName',
      { userEmail, taskName, updatedTaskName }
    );

    await writeTransaction.commit();
    console.log('Task updated successfully');

    
    await writeTransaction.close();

   
    res.status(200).send('Task updated successfully');
  } catch (error) {
    console.error(error);
    
    res.status(500).send('Internal Server Error');
  }
});

// Delete task
app.delete('/tasks/:taskName', checkAuthenticated, async (req, res) => {
  const { taskName } = req.params;
  const userEmail = req.session.userEmail;
  const writeTransaction = neo4jSession.beginTransaction();

  try {
    await writeTransaction.run(
      'MATCH (u:User {email: $userEmail})-[:HAS_TASK]->(t:Task {name: $taskName}) ' +
      'DETACH DELETE t',
      { userEmail, taskName }
    );

    await writeTransaction.commit();
    console.log('Task deleted successfully');

    
    await writeTransaction.close();

    
    res.status(200).send('Task deleted successfully');
  } catch (error) {
    console.error(error);
    
    res.status(500).send('Internal Server Error');
  }
});
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
