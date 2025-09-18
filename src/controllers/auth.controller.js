const jwt = require('jsonwebtoken');
const User = require('../models/User');

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'Email already in use' });

    let finalRole = 'user';
    if (role === 'admin') {
      if (process.env.ALLOW_ADMIN_SIGNUP === 'true') {
        finalRole = 'admin';
      } else {
        // prevent accidental admin signups unless explicitly allowed
        finalRole = 'user';
      }
    }

    const user = await User.create({ name, email, password, role: finalRole });
    const token = signToken(user);
    res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    const token = signToken(user);
    res.json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
};

exports.me = async (req, res) => {
  res.json({ user: req.user });
};
