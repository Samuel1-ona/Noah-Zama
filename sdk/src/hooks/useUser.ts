import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Signer } from 'ethers';
import { UserClient, type Credential, type FHEInputResult } from '../user/UserClient';
import type { Requirements, TransactionResult } from '../utils/types';

/**
 * Configuration options for useUser hook
 */
export interface UseUserOptions {
  userAddress?: string;
  protocolAddress?: string;
  enabled?: boolean;
  queryOptions?: {
    refetchInterval?: number;
    staleTime?: number;
  };
}

/**
 * Return type for useUser hook
 */
export interface UseUserReturn {
  user: UserClient | null;

  // Read operations
  protocolRequirements: Requirements | undefined;
  isLoadingRequirements: boolean;
  requirementsError: Error | null;
  refetchRequirements: () => void;

  isRegistered: boolean | undefined;
  isLoadingRegistration: boolean;
  registrationError: Error | null;
  refetchRegistration: () => void;

  // Write operations (mutations)
  encryptIdentity: {
    mutate: (credential: Credential) => void;
    mutateAsync: (credential: Credential) => Promise<FHEInputResult>;
    isLoading: boolean;
    error: Error | null;
    reset: () => void;
  };

  registerIdentity: {
    mutate: (params: { userAddress: string; fheInput: FHEInputResult }) => void;
    mutateAsync: (params: { userAddress: string; fheInput: FHEInputResult }) => Promise<TransactionResult>;
    isLoading: boolean;
    error: Error | null;
    reset: () => void;
  };

  requestAccessVerification: {
    mutate: (userAddress?: string) => void;
    mutateAsync: (userAddress?: string) => Promise<TransactionResult>;
    isLoading: boolean;
    error: Error | null;
    reset: () => void;
  };
}

/**
 * React hook for user operations (FHE version)
 */
export function useUser(
  signer: Signer | null | undefined,
  options: UseUserOptions = {}
): UseUserReturn {
  const {
    userAddress,
    protocolAddress,
    enabled = true,
    queryOptions = {},
  } = options;

  const queryClient = useQueryClient();

  const user = useMemo(() => {
    if (!signer) return null;
    return new UserClient(signer);
  }, [signer]);

  // Query: Get protocol requirements
  const {
    data: protocolRequirements,
    isLoading: isLoadingRequirements,
    error: requirementsError,
    refetch: refetchRequirements,
  } = useQuery({
    queryKey: ['user', 'protocol-requirements', protocolAddress],
    queryFn: async () => {
      if (!user || !protocolAddress) throw new Error('Params missing');
      return user.getProtocolRequirements(protocolAddress);
    },
    enabled: enabled && !!user && !!protocolAddress,
    ...queryOptions,
  });

  // Query: Check if user is registered
  const {
    data: isRegistered,
    isLoading: isLoadingRegistration,
    error: registrationError,
    refetch: refetchRegistration,
  } = useQuery({
    queryKey: ['user', 'is-registered', userAddress],
    queryFn: async () => {
      if (!user) throw new Error('User client missing');
      return user.isRegistered(userAddress);
    },
    enabled: enabled && !!user,
    ...queryOptions,
  });

  // Mutation: Encrypt identity
  const encryptIdentityMutation = useMutation({
    mutationFn: async (credential: Credential) => {
      if (!user) throw new Error('User client missing');
      return user.encryptIdentity(credential);
    },
  });

  // Mutation: Register identity
  const registerIdentityMutation = useMutation({
    mutationFn: async (params: { userAddress: string; fheInput: FHEInputResult }) => {
      if (!user) throw new Error('User client missing');
      return user.registerIdentity(params.userAddress, params.fheInput);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'is-registered'] });
    },
  });

  // Mutation: Request access
  const requestAccessMutation = useMutation({
    mutationFn: async (userAddress?: string) => {
      if (!user) throw new Error('User client missing');
      return user.requestAccessVerification(userAddress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol', 'access'] });
    },
  });

  return {
    user,
    protocolRequirements,
    isLoadingRequirements,
    requirementsError: requirementsError as Error | null,
    refetchRequirements: () => refetchRequirements(),
    isRegistered,
    isLoadingRegistration,
    registrationError: registrationError as Error | null,
    refetchRegistration: () => refetchRegistration(),
    encryptIdentity: {
      mutate: encryptIdentityMutation.mutate,
      mutateAsync: encryptIdentityMutation.mutateAsync,
      isLoading: encryptIdentityMutation.isPending,
      error: encryptIdentityMutation.error as Error | null,
      reset: encryptIdentityMutation.reset,
    },
    registerIdentity: {
      mutate: registerIdentityMutation.mutate,
      mutateAsync: registerIdentityMutation.mutateAsync,
      isLoading: registerIdentityMutation.isPending,
      error: registerIdentityMutation.error as Error | null,
      reset: registerIdentityMutation.reset,
    },
    requestAccessVerification: {
      mutate: requestAccessMutation.mutate,
      mutateAsync: requestAccessMutation.mutateAsync,
      isLoading: requestAccessMutation.isPending,
      error: requestAccessMutation.error as Error | null,
      reset: requestAccessMutation.reset,
    },
  };
}
