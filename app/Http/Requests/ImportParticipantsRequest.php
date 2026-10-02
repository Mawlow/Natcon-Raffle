<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ImportParticipantsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isAdmin() ?? false;
    }

    public function rules(): array
    {
        return [
            'file' => [
                'required',
                'file',
                'max:10240', // 10 MB
                'mimetypes:text/plain,text/csv,text/x-csv,application/csv,application/vnd.ms-excel,text/comma-separated-values,text/tab-separated-values',
                'extensions:csv,txt,tsv',
            ],
            'on_duplicate' => ['nullable', Rule::in(['skip', 'update'])],
        ];
    }

    public function messages(): array
    {
        return [
            'file.mimetypes' => 'Please upload a CSV file.',
            'file.extensions' => 'Please upload a .csv, .tsv or .txt file.',
            'file.max' => 'The CSV may not be larger than 10 MB.',
        ];
    }
}
