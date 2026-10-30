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
  auditView: ['admin', 'head'],
  // Maintenance forms: keepers/seniors/heads create and edit, juniors may only
  // raise a request, and deletion stays with IT Manager / Technical Head.
  maintView: ['admin', 'head', 'senior', 'store', 'junior'],
  maintCreate: ['admin', 'head', 'senior', 'store', 'junior'],
  maintEdit: ['admin', 'head', 'senior', 'store'],
  maintDelete: ['admin', 'head'],
  inspectionReview: ['admin', 'head', 'store'],
  stocktake: ['admin', 'head', 'store'],
  stocktakeApprove: ['admin', 'head']
};

const can = (user, perm) => {
  const role = typeof user === 'string' ? user : user && user.role;
  if (perm === 'userAdmin') return role === 'admin';
  if (!Object.prototype.hasOwnProperty.call(CAN, perm)) return false;
  const permissions = user && typeof user === 'object' && user.permissions;
  if (permissions && Object.prototype.hasOwnProperty.call(permissions, perm)) {
    return permissions[perm] === true;
  }
  return CAN[perm].includes(role);
};

module.exports = { CAN, can };
