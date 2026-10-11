const bcrypt = require('bcrypt');
async function test() {
  try {
    const hash = await bcrypt.hash('password123', 10);
    console.log('BCRYPT WORKS. Hash:', hash);
  } catch (err) {
    console.error('BCRYPT ERROR:', err.message);
  }
}
test();
