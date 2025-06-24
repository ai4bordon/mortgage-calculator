document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('mortgage-form');
    const loanAmountInput = document.getElementById('loan-amount');
    
    // --- UI Elements ---
    const resultsContainer = document.getElementById('results');
    const errorMessage = document.getElementById('error-message');
    const incomeNote = document.querySelector('.income-note');
    const scheduleContainer = document.getElementById('payment-schedule-container');
    const tableBody = document.getElementById('payment-table-body');
    const chartCanvas = document.getElementById('payment-chart');
    
    // --- Result Fields ---
    const monthlyPaymentContainer = document.getElementById('monthly-payment-container');
    const monthlyPaymentLabel = monthlyPaymentContainer.querySelector('span');
    const monthlyPaymentEl = document.getElementById('monthly-payment');
    const totalOverpaymentEl = document.getElementById('total-overpayment');
    const totalPaymentEl = document.getElementById('total-payment');
    const requiredIncomeEl = document.getElementById('required-income');

    // --- New Controls ---
    const installmentSwitch = document.getElementById('installment-switch');
    const interestRateGroup = document.getElementById('interest-rate-group');
    const interestRateInput = document.getElementById('interest-rate');
    const exportCsvButton = document.getElementById('export-csv');
    const earlyRepaymentContainer = document.getElementById('early-repayment-container');
    const addRepaymentBtn = document.getElementById('add-repayment-btn');
    const repaymentList = document.getElementById('repayment-list');
    const repaymentMonthInput = document.getElementById('repayment-month');
    const repaymentAmountInput = document.getElementById('repayment-amount');

    // --- State ---
    let paymentChart = null;
    let currentScheduleData = [];
    let earlyRepayments = [];

    // --- Formatters ---
    const formatCurrency = (value) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(value);
    const formatNumber = (value) => new Intl.NumberFormat('ru-RU', { useGrouping: true }).format(value);
    
    // --- Event Listeners ---

    // Input formatting for loan amount
    loanAmountInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        let selectionStart = e.target.selectionStart;
        let originalLength = e.target.value.length;
        if (value) {
            e.target.value = formatNumber(value);
            // Adjust cursor position
            let newLength = e.target.value.length;
            e.target.selectionStart = e.target.selectionEnd = selectionStart + (newLength - originalLength);
        } else {
            e.target.value = '';
        }
    });

    // Installment mode switch
    installmentSwitch.addEventListener('change', function() {
        interestRateGroup.classList.toggle('hidden', this.checked);
        interestRateInput.required = !this.checked;
    });
    // Add transition to the CSS rule for smooth effect
    interestRateGroup.style.transition = 'opacity 0.4s ease, max-height 0.4s ease, margin 0.4s ease, padding 0.4s ease, visibility 0.4s ease';

    addRepaymentBtn.addEventListener('click', () => {
        const month = repaymentMonthInput.value;
        const amount = repaymentAmountInput.value;
        const repayment_type = document.querySelector('input[name="repayment_type"]:checked').value;

        if (!month || !amount || month <= 0 || amount <= 0) {
            alert('Пожалуйста, введите корректные номер платежа и сумму.');
            return;
        }

        earlyRepayments.push({ month, amount, repayment_type });
        renderRepaymentList();
        repaymentMonthInput.value = '';
        repaymentAmountInput.value = '';
        form.requestSubmit(); // Automatically recalculate
    });

    repaymentList.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-repayment-btn')) {
            const index = e.target.dataset.index;
            earlyRepayments.splice(index, 1);
            renderRepaymentList();
            form.requestSubmit(); // Automatically recalculate
        }
    });

    // Form submission
    form.addEventListener('submit', function(e) {
        e.preventDefault();

        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Считаем...';

        // Hide all result/info blocks
        resultsContainer.classList.add('hidden');
        errorMessage.classList.add('hidden');
        incomeNote.classList.add('hidden');
        scheduleContainer.classList.add('hidden');
        earlyRepaymentContainer.classList.add('hidden');

        // Clear previous data
        tableBody.innerHTML = '';
        currentScheduleData = [];
        if (paymentChart) {
            paymentChart.destroy();
        }

        const loanAmount = loanAmountInput.value.replace(/\s/g, '');
        const termYears = document.getElementById('term-years').value;
        const interestRate = installmentSwitch.checked ? 0 : interestRateInput.value;
        const paymentType = document.querySelector('input[name="payment_type"]:checked').value;

        const requestBody = {
            loan_amount: loanAmount,
            term_years: termYears,
            interest_rate: interestRate,
            payment_type: paymentType,
            early_repayments: earlyRepayments
        };

        fetch('/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showError(data.error);
            } else {
                currentScheduleData = data.payment_schedule;
                displayResults(data, paymentType);
                displaySchedule(data.payment_schedule);
                createChart(data.loan_amount, data.total_overpayment);
                earlyRepaymentContainer.classList.remove('hidden');
            }
        })
        .catch(error => {
            console.error('Ошибка:', error);
            showError('Произошла непредвиденная ошибка. Пожалуйста, проверьте консоль.');
        })
        .finally(() => {
            submitButton.disabled = false;
            submitButton.textContent = 'Рассчитать';
        });
    });

    // CSV Export
    exportCsvButton.addEventListener('click', handleExportCsv);

    // --- Display Functions ---

    function displayResults(data, paymentType) {
        if (paymentType === 'differentiated') {
            monthlyPaymentLabel.textContent = 'Ежемесячный платеж (диапазон)';
            const [first, last] = data.monthly_payment.split(' ... ');
            monthlyPaymentEl.innerHTML = `${formatCurrency(first)} &nbsp;...&nbsp; ${formatCurrency(last)}`;
        } else {
            monthlyPaymentLabel.textContent = 'Ежемесячный платеж';
            monthlyPaymentEl.textContent = formatCurrency(data.monthly_payment);
        }
        
        totalOverpaymentEl.textContent = formatCurrency(data.total_overpayment);
        totalPaymentEl.textContent = formatCurrency(data.total_payment);
        requiredIncomeEl.textContent = formatCurrency(data.required_income);
        
        resultsContainer.classList.remove('hidden');
        incomeNote.classList.remove('hidden');
    }

    function displaySchedule(scheduleData) {
        if (scheduleData.length === 0) return;
        
        scheduleData.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.payment_number}</td>
                <td>${row.payment_date}</td>
                <td>${formatNumber(row.monthly_payment)}</td>
                <td>${formatNumber(row.principal_payment)}</td>
                <td>${formatNumber(row.interest_payment)}</td>
                <td>${formatNumber(row.remaining_balance)}</td>
            `;
            tableBody.appendChild(tr);
        });
        scheduleContainer.classList.remove('hidden');
    }
    
    function createChart(principal, interest) {
        const ctx = chartCanvas.getContext('2d');
        paymentChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Основной долг', 'Переплата по процентам'],
                datasets: [{
                    data: [principal, interest],
                    backgroundColor: ['#8A2BE2', '#4D7EFA'],
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#e0e0e0' }
                    },
                    tooltip: {
                        bodyColor: '#e0e0e0',
                        titleColor: '#e0e0e0',
                        callbacks: {
                            label: (context) => formatCurrency(context.parsed)
                        }
                    }
                }
            }
        });
    }

    function renderRepaymentList() {
        repaymentList.innerHTML = '';
        if (earlyRepayments.length > 0) {
            document.getElementById('repayment-list-container').style.display = 'block';
        } else {
            document.getElementById('repayment-list-container').style.display = 'none';
        }

        earlyRepayments.forEach((item, index) => {
            const li = document.createElement('li');
            const typeText = item.repayment_type === 'reduce_payment' ? 'уменьшение платежа' : 'сокращение срока';
            li.innerHTML = `
                <span>${index + 1}. В ${item.month}-й месяц: ${formatCurrency(item.amount)} (${typeText})</span>
                <button class="remove-repayment-btn" data-index="${index}">&times;</button>
            `;
            repaymentList.appendChild(li);
        });
    }

    function handleExportCsv() {
        if (currentScheduleData.length === 0) return;

        // Add BOM for Excel to recognize UTF-8 correctly
        const BOM = '\uFEFF';

        const headers = ['"Номер платежа"', '"Дата"', '"Сумма платежа"', '"Основной долг"', '"Проценты"', '"Остаток долга"'];
        
        const rows = currentScheduleData.map(row => 
            [
                row.payment_number,
                `"${row.payment_date}"`,
                row.monthly_payment,
                row.principal_payment,
                row.interest_payment,
                row.remaining_balance
            ].join(',')
        );

        const csvString = [headers.join(','), ...rows].join('\n');
        
        const blob = new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "payment_schedule.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }
}); 