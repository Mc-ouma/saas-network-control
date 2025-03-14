const { Client } = require('ssh2');

const sshConfig = {
  host: process.env.SSH_HOST,
  port: process.env.SSH_PORT,
  username: process.env.SSH_USER,
  password: process.env.SSH_PASS
};

function executeSSHCommand(command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) reject(err);
        let output = '';
        stream.on('data', (data) => output += data);
        stream.on('close', (code, signal) => {
          conn.end();
          resolve({ code, signal, output });
        });
      });
    }).on('error', (err) => reject(err)).connect(sshConfig);
  });
}

async function ruleExists(ip, clientId) {
  const command = `iptables -C INPUT -s ${ip} -m comment --comment "block-${clientId}" -j DROP`;
  try {
    const result = await executeSSHCommand(command);
    return result.code === 0;
  } catch (err) {
    return false;
  }
}

async function addBlockRule(ip, clientId) {
  const command = `iptables -A INPUT -s ${ip} -m comment --comment "block-${clientId}" -j DROP`;
  await executeSSHCommand(command);
}

async function deleteBlockRule(ip, clientId) {
  const command = `iptables -D INPUT -s ${ip} -m comment --comment "block-${clientId}" -j DROP`;
  await executeSSHCommand(command);
}

async function setNetworkAccess(client) {
  const now = new Date();
  const shouldBlock = client.subscriptionEndDate < now;
  const ruleShouldExist = shouldBlock;
  const ruleExistsCurrently = await ruleExists(client.ipAddress, client.clientId);
  if (ruleShouldExist && !ruleExistsCurrently) {
    await addBlockRule(client.ipAddress, client.clientId);
  } else if (!ruleShouldExist && ruleExistsCurrently) {
    await deleteBlockRule(client.ipAddress, client.clientId);
  }
}

module.exports = { setNetworkAccess };