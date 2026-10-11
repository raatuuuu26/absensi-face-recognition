const bcrypt = require('bcrypt');
async function test() {
  const isMatch = await bcrypt.compare('password123', '/F3l70v4i7j6Kz.U5Y5s8xWp5y5LqR6M9/1V0/2l3m4n5');
  console.log('Match?', isMatch);
}
test();
