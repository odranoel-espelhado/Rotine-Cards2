export type ActionState<T> = {
    error?: string;
    success?: boolean;
    data?: T;
};
