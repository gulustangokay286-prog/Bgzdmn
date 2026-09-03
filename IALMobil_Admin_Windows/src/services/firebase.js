import { vdsUserService } from './vdsUserService';

class FirebaseService {
  async fetchAllUsers() {
    return vdsUserService.fetchAllUsers();
  }

  async updateUserStatus(documentId, newStatus) {
    return vdsUserService.updateUser(documentId, { status: newStatus });
  }

  async updateUserStatusAndBranch(documentId, newStatus, newBranch) {
    const updates = { status: newStatus };
    if (newBranch) updates.branch = newBranch;
    return vdsUserService.updateUser(documentId, updates);
  }

  async resetDeviceLock(documentId) {
    return vdsUserService.resetDeviceLock(documentId);
  }

  async deleteUser(documentId) {
    return vdsUserService.deleteUser(documentId);
  }
}

export const firebaseService = new FirebaseService();
