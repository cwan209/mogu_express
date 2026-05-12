import { callCloud } from './client';

export interface Address {
  _id: string;
  recipient: string;
  phone: string;
  line1: string;
  line2?: string;
  suburb: string;
  state: string;
  postcode: string;
  isDefault: boolean;
}

export async function listAddresses(): Promise<Address[]> {
  const r = await callCloud<{ items: Address[] }>('listAddresses');
  return r.items;
}

export async function upsertAddress(address: Partial<Address>): Promise<{ _id: string }> {
  return callCloud('upsertAddress', { address });
}

export async function deleteAddress(addressId: string): Promise<{ code: 0 }> {
  return callCloud('deleteAddress', { addressId });
}
