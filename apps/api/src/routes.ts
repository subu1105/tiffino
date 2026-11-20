import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { customerRouter } from './modules/customers/customer.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { cookRouter } from './modules/cook/cook.routes';
import { expenseRouter } from './modules/expenses/expense.routes';
import { orderRouter } from './modules/orders/order.routes';
import { paymentRouter } from './modules/payments/payment.routes';
import { reportRouter } from './modules/reports/report.routes';
import { statementRouter } from './modules/statements/statement.routes';
import { userRouter } from './modules/users/user.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/customers', customerRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/payments', paymentRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/reports', reportRouter);
apiRouter.use('/statements', statementRouter);
apiRouter.use('/expenses', expenseRouter);
apiRouter.use('/cook-ledger', cookRouter);
