<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('raffles', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->string('prize_name');
            $table->decimal('prize_value', 14, 2)->nullable();
            $table->string('prize_currency', 8)->default('PHP');
            $table->unsignedSmallInteger('winners_count')->default(1);
            $table->string('participant_pool')->nullable();
            $table->string('status', 24)->default('DRAFT');
            $table->boolean('allow_repeat_winners')->default(false);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('archived_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('status');
            $table->index(['status', 'archived_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('raffles');
    }
};
