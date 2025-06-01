// src/policies/permission.policy.ts

export type Role = 'ADMIN' | 'SUPERUSER' | 'USER';
export type Resource = 'user' | 'company';
export type Action   = 'create' | 'read' | 'update' | 'delete';
export type Perm     = `${Action}:${'any'|'own'}`;

export type PermissionPolicy = {
  [R in Role]: {
    [Res in Resource]: Perm[];
  }
};

export const permissionPolicy: PermissionPolicy = {
  ADMIN: {
    user:    ['create:any','read:any','update:any','delete:any'],
    company: ['create:any','read:any','update:any','delete:any']
  },
  SUPERUSER: {
    user:    ['create:own','read:own','update:own','delete:own'],
    company: ['read:own']
  },
  USER: {
    user:    ['read:own','update:own'],
    company: []
  }
};
