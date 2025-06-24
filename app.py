from flask import Flask, render_template, request, jsonify
import math
from datetime import datetime
from dateutil.relativedelta import relativedelta

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    data = request.get_json()

    try:
        loan_amount = float(data['loan_amount'])
        term_years = int(data['term_years'])
        interest_rate = float(data['interest_rate'])
        payment_type = data.get('payment_type', 'annuity')
        early_repayments = data.get('early_repayments', [])

        # Сортируем досрочные платежи по номеру месяца
        early_repayments.sort(key=lambda x: int(x['month']))

        if loan_amount <= 0 or term_years <= 0 or interest_rate < 0:
            return jsonify({'error': 'Сумма и срок должны быть положительными, ставка не может быть отрицательной.'}), 400

        monthly_interest_rate = (interest_rate / 100) / 12
        number_of_payments = term_years * 12

        payment_schedule = []
        remaining_balance = loan_amount
        current_date = datetime.now()
        SUBSISTENCE_MINIMUM = 16844
        
        # --- Основной цикл расчета ---
        
        # Аннуитетный платеж
        monthly_payment = 0
        if monthly_interest_rate > 0:
            monthly_payment = (loan_amount * monthly_interest_rate * (1 + monthly_interest_rate)**number_of_payments) / ((1 + monthly_interest_rate)**number_of_payments - 1)
        else:
            monthly_payment = loan_amount / number_of_payments
        
        required_income = monthly_payment + SUBSISTENCE_MINIMUM

        i = 1
        while remaining_balance > 0.01 and i <= number_of_payments:
            # Применение досрочного платежа
            for er in early_repayments:
                if i == int(er['month']):
                    remaining_balance -= float(er['amount'])
                    if payment_type == 'annuity':
                        if er['repayment_type'] == 'reduce_payment':
                            # Пересчет ежемесячного платежа
                            remaining_term = number_of_payments - i + 1
                            if remaining_balance > 0 and monthly_interest_rate > 0:
                                monthly_payment = (remaining_balance * monthly_interest_rate * (1 + monthly_interest_rate)**remaining_term) / ((1 + monthly_interest_rate)**remaining_term - 1)
                            else:
                                monthly_payment = remaining_balance / remaining_term if remaining_term > 0 else 0
                        # При сокращении срока платеж не меняется, срок сократится автоматически
            
            if remaining_balance <= 0: break

            interest_payment = remaining_balance * monthly_interest_rate
            
            if payment_type == 'annuity':
                principal_payment = monthly_payment - interest_payment
                current_monthly_payment = monthly_payment
            else: # Differentiated
                principal_payment_monthly = loan_amount / (term_years * 12) # Базовая часть основного долга
                principal_payment = principal_payment_monthly
                current_monthly_payment = principal_payment + interest_payment

            if principal_payment > remaining_balance:
                principal_payment = remaining_balance
            
            current_monthly_payment = principal_payment + interest_payment

            remaining_balance -= principal_payment
            
            payment_schedule.append({
                'payment_number': i,
                'payment_date': (current_date + relativedelta(months=i)).strftime('%d.%m.%Y'),
                'monthly_payment': round(current_monthly_payment, 2),
                'principal_payment': round(principal_payment, 2),
                'interest_payment': round(interest_payment, 2),
                'remaining_balance': round(abs(remaining_balance), 2)
            })
            i += 1
        
        # --- Корректировка после цикла ---
        
        total_payment = sum(p['monthly_payment'] for p in payment_schedule)
        total_overpayment = total_payment - loan_amount

        if not payment_schedule:
             return jsonify({
                'monthly_payment': 0, 'total_overpayment': 0, 'total_payment': loan_amount,
                'required_income': 0, 'payment_schedule': [], 'loan_amount': loan_amount
            })

        if payment_type == 'annuity':
            monthly_payment_response = payment_schedule[0]['monthly_payment']
        else:
            first_p = payment_schedule[0]['monthly_payment']
            last_p = payment_schedule[-1]['monthly_payment']
            monthly_payment_response = f"{first_p} ... {last_p}"


        return jsonify({
            'monthly_payment': monthly_payment_response,
            'total_overpayment': round(total_overpayment, 2),
            'total_payment': round(total_payment, 2),
            'required_income': round(required_income, 2),
            'payment_schedule': payment_schedule,
            'loan_amount': loan_amount,
        })
    
    except (ValueError, KeyError) as e:
        print(e) # Для отладки
        return jsonify({'error': 'Неверные или отсутствующие данные.'}), 400

if __name__ == '__main__':
    app.run(debug=True) 