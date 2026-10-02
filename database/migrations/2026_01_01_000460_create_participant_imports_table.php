<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('participant_imports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('raffle_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('original_filename');
            // Hash of the uploaded file, used to warn about accidental duplicate imports.
            $table->string('file_hash', 64);
            $table->unsignedInteger('total_rows')->default(0);
            $table->unsignedInteger('imported_rows')->default(0);
            $table->unsignedInteger('updated_rows')->default(0);
            $table->unsignedInteger('skipped_rows')->default(0);
            $table->string('status', 24)->default('COMPLETED');
            $table->json('summary')->nullable();
            $table->timestamps();

            $table->index(['raffle_id', 'file_hash']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('participant_imports');
    }
};
