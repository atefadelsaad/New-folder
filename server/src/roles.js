'use strict';

// Permission map mirrored by the client (CAN in it-warehouse_1.html).
// `pool` gates movements that touch the under-maintenance / scrap pools.
const CAN = {
  addBranch: ['admin', 'head'],
  stock: ['admin', 'head', 'store'],
  view: ['admin', 'head', 'senior', 'area', 'store'],
  review: ['admin', 'head', 'senior'],
  reject: ['admin', 'head', 'area', 'store'],
  edit: ['admin', 'head', 'area', 'store'],
  delRecv: ['admin', 'head'],
  request: ['admin', 'head', 'senior', 'junior'],
  branchEdit: ['admin', 'head', 'senior'],
  approve: ['admin', 'head', 'area'],
  release: ['admin', 'head', 'store'],
  pool: ['admin', 'head'],
  // Maintenance forms: keepers/seniors/heads create and edit, juniors may only
  // raise a request, and deletion stays with IT Manager / Technical Head.
  maintView: ['admin', 'head', 'senior', 'store', 'junior'],
  maintCreate: ['admin', 'head', 'senior', 'store', 'junior'],
  maintEdit: ['admin', 'head', 'senior', 'store'],
  maintDelete: ['admin', 'head']
};

const can = (role, perm) => CAN[perm].includes(role);

module.exports = { CAN, can };
