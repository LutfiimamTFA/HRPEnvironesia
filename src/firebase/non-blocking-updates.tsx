'use client';
    
import {
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  CollectionReference,
  DocumentReference,
  SetOptions,
  DocumentData,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import {FirestorePermissionError} from '@/firebase/errors';

/**
 * Initiates a setDoc operation for a document reference.
 * Returns a promise that resolves on success or rejects on failure.
 */
export function setDocumentNonBlocking(docRef: DocumentReference, data: any, options: SetOptions): Promise<void> {
  return setDoc(docRef, data, options).catch(error => {
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: docRef.path,
        operation: options && 'merge' in options ? 'update' : 'create',
        requestResourceData: data,
      })
    );
    throw error;
  });
}


/**
 * Initiates an addDoc operation for a collection reference.
 * Returns a promise that resolves with the new doc ref or rejects on failure.
 */
export function addDocumentNonBlocking(colRef: CollectionReference, data: any): Promise<DocumentReference<DocumentData>> {
  return addDoc(colRef, data)
    .catch(error => {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: colRef.path,
          operation: 'create',
          requestResourceData: data,
        })
      );
      throw error;
    });
}


/**
 * Initiates an updateDoc operation for a document reference.
 * Returns a promise that resolves on success or rejects on failure.
 */
export function updateDocumentNonBlocking(docRef: DocumentReference, data: any): Promise<void> {
  return updateDoc(docRef, data)
    .catch(error => {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: docRef.path,
          operation: 'update',
          requestResourceData: data,
        })
      );
      throw error;
    });
}


/**
 * Initiates a deleteDoc operation for a document reference.
 * Returns a promise that resolves on success or rejects on failure.
 */
export function deleteDocumentNonBlocking(docRef: DocumentReference): Promise<void> {
  return deleteDoc(docRef)
    .catch(error => {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        })
      );
      throw error;
    });
}
