'use strict';

// Idiomatic, human-grade code — the benchmark's "clean" baseline.
const users = new Map();

function getUser(id) {
  const user = users.get(id);
  if (!user) {
    return null;
  }
  return user;
}

async function saveUser(user) {
  try {
    await users.set(user.id, user);
    return { saved: true, id: user.id };
  } catch (error) {
    throw new Error(`failed to save user ${user.id}: ${error.message}`);
  }
}

function activeCount(list) {
  return list.filter((u) => u.active).length;
}

module.exports = { getUser, saveUser, activeCount };
